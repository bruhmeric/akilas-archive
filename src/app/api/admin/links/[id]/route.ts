import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/app/api/admin/guard";

export const dynamic = "force-dynamic";

/** Revoke a one-time link */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  try {
    await db.linkToken.update({ where: { id }, data: { revoked: true } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
}
