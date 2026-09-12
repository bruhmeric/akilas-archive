import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/app/api/admin/guard";
import { cacheInvalidatePrefix } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const existing = await db.bucket.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Bucket not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.alias !== undefined) {
      const alias = String(body.alias).trim().toLowerCase().replace(/\s+/g, "-");
      if (!alias || !/^[a-z0-9][a-z0-9._-]*$/.test(alias)) {
        throw new Error("Alias must be a valid directory name");
      }
      data.alias = alias;
    }
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new Error("bucket name is required");
      data.name = name;
    }
    if (body.accessKeyId !== undefined) {
      const v = String(body.accessKeyId).trim();
      if (!v) throw new Error("Access Key ID cannot be empty");
      data.accessKeyId = v;
    }
    if (body.secretAccessKey !== undefined && body.secretAccessKey !== "") {
      data.secretAccessKey = String(body.secretAccessKey).trim();
    }
    if (body.endpoint !== undefined) {
      const v = String(body.endpoint).trim();
      if (v && !/^https?:\/\//.test(v)) throw new Error("Endpoint must start with http(s)://");
      data.endpoint = v || null;
    }
    if (body.description !== undefined) {
      data.description = String(body.description).trim() || null;
    }
    if (body.served !== undefined) {
      data.served = Boolean(body.served);
    }
    if (body.sortOrder !== undefined) {
      data.sortOrder = Number(body.sortOrder) || 0;
    }

    await db.bucket.update({ where: { id }, data });
    cacheInvalidatePrefix("fs:");
    cacheInvalidatePrefix("flat:");
    cacheInvalidatePrefix("stats:");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const e = err as Error;
    const conflict = e.message.includes("Unique constraint");
    return NextResponse.json(
      { error: conflict ? "A bucket with this name or alias already exists" : e.message },
      { status: conflict ? 409 : 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  try {
    await db.bucket.delete({ where: { id } });
    cacheInvalidatePrefix("fs:");
    cacheInvalidatePrefix("flat:");
    cacheInvalidatePrefix("stats:");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bucket not found" }, { status: 404 });
  }
}
