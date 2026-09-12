import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/app/api/admin/guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const take = Math.min(200, Number(url.searchParams.get("take")) || 100);

  const links = await db.linkToken.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { bucket: { select: { alias: true } } },
  });

  return NextResponse.json({
    links: links.map((l) => ({
      id: l.id,
      token: l.token,
      fileName: l.fileName,
      fileSize: l.fileSize !== null ? Number(l.fileSize) : null,
      bucketAlias: l.bucket.alias,
      createdAt: l.createdAt.toISOString(),
      expiresAt: l.expiresAt.toISOString(),
      redeemedAt: l.redeemedAt ? l.redeemedAt.toISOString() : null,
      redeemedIp: l.redeemedIp,
      revoked: l.revoked,
    })),
  });
}
