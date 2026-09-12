import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { presignDownload } from "@/lib/r2";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

function gonePage(reason: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>410 — Link Expired</title>
<style>
  body { background:#050805; color:#4ade80; font-family: ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace;
         display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  .box { border:1px solid #14532d; padding:2rem; max-width:640px; width:90%; }
  h1 { font-size:1rem; font-weight:normal; margin:0 0 1rem; }
  .dim { color:#166534; }
  a { color:#4ade80; }
</style>
</head>
<body>
  <div class="box">
    <h1>visitor@akilas-archive:~$ <span class="dim">curl -O /api/dl/…</span></h1>
    <h1>HTTP 410 — ${reason}</h1>
    <p class="dim">This one-time link is no longer valid.<br/>Each link works exactly once and cannot be reused.</p>
    <p class="dim">Return to the terminal at <a href="/">akilasarchive.site</a></p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 410,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return gonePage("invalid link");
  }

  const record = await db.linkToken.findUnique({
    where: { token },
    include: { bucket: true },
  });

  if (!record || record.revoked) return gonePage("link not found");

  if (record.expiresAt.getTime() < Date.now()) {
    return gonePage("link expired");
  }

  // Atomic single-use redemption: only succeeds if not yet redeemed
  const redeemed = await db.linkToken.updateMany({
    where: { id: record.id, redeemedAt: null, revoked: false },
    data: {
      redeemedAt: new Date(),
      redeemedIp:
        _req.headers.get("cf-connecting-ip") ||
        _req.headers.get("x-real-ip") ||
        "unknown",
    },
  });

  if (redeemed.count !== 1) {
    return gonePage("link already used");
  }

  try {
    const settings = await getSettings();
    const url = await presignDownload(
      record.bucket,
      record.key,
      Number(settings.presignExpirySeconds) || 300,
      record.fileName
    );
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    // Roll back redemption so the user can retry once storage is reachable again
    await db.linkToken.update({
      where: { id: record.id },
      data: { redeemedAt: null, redeemedIp: null },
    });
    return gonePage("storage temporarily unavailable");
  }
}
