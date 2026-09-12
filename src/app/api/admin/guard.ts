import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/auth";

/** Guard helper for admin API routes */
export function requireAdmin(req: Request): NextResponse | null {
  const session = sessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
