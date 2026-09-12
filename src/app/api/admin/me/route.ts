import { NextRequest, NextResponse } from "next/server";
import { sessionFromRequest, usingDefaultCredentials } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    username: session.username,
    usingDefaultPassword: usingDefaultCredentials(),
  });
}
