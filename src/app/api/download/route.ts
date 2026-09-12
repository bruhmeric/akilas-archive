import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { resolveFile, headObject, friendlyStorageError } from "@/lib/r2";
import { getSettings } from "@/lib/settings";
import { rateLimit } from "@/lib/cache";

export const dynamic = "force-dynamic";

export function baseUrlFromReq(req: NextRequest): string {
  const envUrl = process.env.PUBLIC_BASE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // 30 link creations per hour per IP
  if (!rateLimit(`dl:${ip}`, 30, 3600_000)) {
    return NextResponse.json(
      { error: "Too many download requests. Try again later." },
      { status: 429 }
    );
  }

  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const path = (body.path || "").trim();
  if (!path || path.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const { bucket, key, name } = await resolveFile(path);

    // Verify the object exists (and grab its size)
    let size: number | null = null;
    try {
      const head = await headObject(bucket, key);
      size = head.ContentLength ?? null;
    } catch (err) {
      const e = err as Error;
      if (e.name === "NotFound" || /404|not found/i.test(e.message)) {
        return NextResponse.json({ error: `No such file: ${path}` }, { status: 404 });
      }
      return NextResponse.json({ error: friendlyStorageError(err) }, { status: 502 });
    }

    const settings = await getSettings();
    const expiryHours = Math.max(0.1, Number(settings.linkExpiryHours) || 24);
    const token = randomBytes(32).toString("base64url");

    const link = await db.linkToken.create({
      data: {
        token,
        bucketId: bucket.id,
        key,
        fileName: name,
        fileSize: size !== null ? BigInt(size) : null,
        expiresAt: new Date(Date.now() + expiryHours * 3600_000),
      },
    });

    return NextResponse.json({
      url: `${baseUrlFromReq(req)}/api/dl/${link.token}`,
      fileName: name,
      size,
      expiresAt: link.expiresAt.toISOString(),
      singleUse: true,
    });
  } catch (err) {
    const e = err as Error;
    const status = e.message.includes("No such") ? 404 : e.message.includes("Not a file") ? 400 : 500;
    return NextResponse.json({ error: e.message || "Failed to create link" }, { status });
  }
}
