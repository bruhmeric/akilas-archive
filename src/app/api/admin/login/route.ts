import { NextRequest, NextResponse } from "next/server";
import {
  verifyCredentials,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  usingDefaultCredentials,
} from "@/lib/auth";
import { rateLimit } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
  // 10 login attempts per 15 minutes per IP
  if (!rateLimit(`login:${ip}`, 10, 900_000)) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429 }
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = body.username || "";
  const password = body.password || "";

  if (!verifyCredentials(username, password)) {
    return NextResponse.json({ error: "Access denied" }, { status: 401 });
  }

  const res = NextResponse.json({
    ok: true,
    usingDefaultPassword: usingDefaultCredentials(),
  });
  res.cookies.set(SESSION_COOKIE, createSessionToken(username), sessionCookieOptions());
  return res;
}
