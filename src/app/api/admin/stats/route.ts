import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/app/api/admin/guard";
import { flatList } from "@/lib/r2";
import { cacheGet, cacheSet } from "@/lib/cache";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const STATS_TTL_MS = 300_000;

type BucketStat = {
  id: string;
  alias: string;
  name: string;
  served: boolean;
  files: number;
  size: number;
  truncated: boolean;
};

async function computeStats(): Promise<{ buckets: BucketStat[]; links: { total: number; redeemed: number; active: number }; scanLimit: number }> {
  const settings = await getSettings();
  const scanLimit = Number(settings.searchScanLimit) || 20000;
  const buckets = await db.bucket.findMany({
    orderBy: [{ sortOrder: "asc" }, { alias: "asc" }],
  });

  const stats: BucketStat[] = [];
  for (const bucket of buckets) {
    const cacheKey = `stats:${bucket.id}`;
    let stat = cacheGet<BucketStat>(cacheKey);
    if (!stat) {
      try {
        const { keys, truncated } = await flatList(bucket, scanLimit);
        stat = {
          id: bucket.id,
          alias: bucket.alias,
          name: bucket.name,
          served: bucket.served,
          files: keys.length,
          size: keys.reduce((acc, k) => acc + k.size, 0),
          truncated,
        };
      } catch {
        stat = { id: bucket.id, alias: bucket.alias, name: bucket.name, served: bucket.served, files: -1, size: 0, truncated: false };
      }
      cacheSet(cacheKey, stat, STATS_TTL_MS);
    }
    stats.push(stat);
  }

  const [total, redeemed, active] = await Promise.all([
    db.linkToken.count(),
    db.linkToken.count({ where: { redeemedAt: { not: null } } }),
    db.linkToken.count({ where: { redeemedAt: null, revoked: false, expiresAt: { gt: new Date() } } }),
  ]);

  return { buckets: stats, links: { total, redeemed, active }, scanLimit };
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const stats = await computeStats();
  return NextResponse.json(stats);
}
