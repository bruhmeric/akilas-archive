import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { cookies } from "next/headers";

/**
 * Minimal stateless admin session:
 * cookie value = base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
 */

export const SESSION_COOKIE = "aa_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function secret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
}

export function adminUsername(): string {
  return process.env.ADMIN_USERNAME || "admin";
}

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "changeme";
}

export function usingDefaultCredentials(): boolean {
  return !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "changeme";
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyCredentials(username: string, password: string): boolean {
  return (
    safeEqual(username, adminUsername()) && safeEqual(password, adminPassword())
  );
}

export function createSessionToken(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL_MS })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): { username: string } | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.u !== "string" || typeof data.exp !== "number") return null;
    if (Date.now() > data.exp) return null;
    return { username: data.u };
  } catch {
    return null;
  }
}

/** Read the current admin session from request cookies (server components / route handlers) */
export async function getSession(): Promise<{ username: string } | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Check the session of a Next.js Request (route handlers) */
export function sessionFromRequest(req: Request): { username: string } | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  return verifySessionToken(match.slice(SESSION_COOKIE.length + 1));
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function newCsrfToken(): string {
  return randomBytes(24).toString("base64url");
}
