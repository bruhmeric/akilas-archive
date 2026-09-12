import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/app/api/admin/guard";
import { cacheInvalidatePrefix } from "@/lib/cache";

export const dynamic = "force-dynamic";

function parseBucketBody(body: Record<string, unknown>) {
  const alias = String(body.alias || "").trim().toLowerCase().replace(/\s+/g, "-");
  const name = String(body.name || "").trim();
  const accessKeyId = String(body.accessKeyId || "").trim();
  const secretAccessKey = String(body.secretAccessKey || "").trim();
  const endpointRaw = String(body.endpoint || "").trim();
  const description = String(body.description || "").trim() || null;
  const sortOrder = Number(body.sortOrder) || 0;

  if (!alias || !/^[a-z0-9][a-z0-9._-]*$/.test(alias)) {
    throw new Error("Alias must be a valid directory name (letters, numbers, dashes)");
  }
  if (!name) throw new Error("bucket name is required");
  if (!accessKeyId || !secretAccessKey) throw new Error("API credentials are required");
  if (endpointRaw && !/^https?:\/\//.test(endpointRaw)) {
    throw new Error("Endpoint must start with http:// or https://");
  }

  return {
    alias,
    name,
    accessKeyId,
    secretAccessKey,
    endpoint: endpointRaw || null,
    description,
    sortOrder,
  };
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const buckets = await db.bucket.findMany({
    orderBy: [{ sortOrder: "asc" }, { alias: "asc" }],
    select: {
      id: true,
      name: true,
      alias: true,
      description: true,
      endpoint: true,
      served: true,
      sortOrder: true,
      createdAt: true,
      // Never expose secrets to the client
      accessKeyId: true,
    },
  });
  return NextResponse.json({ buckets });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const data = parseBucketBody(body);
    const bucket = await db.bucket.create({ data });
    cacheInvalidatePrefix("fs:");
    return NextResponse.json({ ok: true, id: bucket.id });
  } catch (err) {
    const e = err as Error;
    const conflict = e.message.includes("Unique constraint");
    return NextResponse.json(
      { error: conflict ? "A bucket with this name or alias already exists" : e.message },
      { status: conflict ? 409 : 400 }
    );
  }
}
