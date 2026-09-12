import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Public site metadata for the terminal boot screen */
export async function GET() {
  const [count, settings] = await Promise.all([
    db.bucket.count({ where: { served: true } }),
    getSettings(),
  ]);
  return NextResponse.json({
    motd: settings.motd,
    servedBuckets: count,
    host: process.env.PUBLIC_HOSTNAME || "akilasarchive.site",
  });
}
