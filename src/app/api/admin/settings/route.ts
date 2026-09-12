import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/guard";
import { getSettings, setSetting, DEFAULT_SETTINGS, SettingsKey } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ settings: await getSettings(), defaults: DEFAULT_SETTINGS });
}

export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const updates: { key: SettingsKey; value: string }[] = [];

    if (body.presignExpirySeconds !== undefined) {
      const n = Number(body.presignExpirySeconds);
      if (Number.isNaN(n) || n < 10 || n > 3600) {
        return NextResponse.json({ error: "Presigned URL expiry must be 10-3600 seconds" }, { status: 400 });
      }
      updates.push({ key: "presignExpirySeconds", value: String(Math.round(n)) });
    }
    if (body.linkExpiryHours !== undefined) {
      const n = Number(body.linkExpiryHours);
      if (Number.isNaN(n) || n < 0.1 || n > 720) {
        return NextResponse.json({ error: "Link expiry must be 0.1-720 hours" }, { status: 400 });
      }
      updates.push({ key: "linkExpiryHours", value: String(n) });
    }
    if (body.motd !== undefined) {
      const v = String(body.motd).slice(0, 500);
      updates.push({ key: "motd", value: v });
    }
    if (body.searchScanLimit !== undefined) {
      const n = Number(body.searchScanLimit);
      if (Number.isNaN(n) || n < 1000 || n > 100000) {
        return NextResponse.json({ error: "Scan limit must be 1000-100000" }, { status: 400 });
      }
      updates.push({ key: "searchScanLimit", value: String(Math.round(n)) });
    }

    for (const u of updates) await setSetting(u.key, u.value);
    return NextResponse.json({ ok: true, settings: await getSettings() });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
