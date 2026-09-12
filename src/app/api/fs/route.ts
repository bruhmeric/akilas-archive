import { NextRequest, NextResponse } from "next/server";
import { listPath, friendlyStorageError } from "@/lib/r2";
import { cacheGet, cacheSet } from "@/lib/cache";

export const dynamic = "force-dynamic";

const FS_TTL_MS = 30_000;

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || "/";
  if (path.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const cacheKey = `fs:${path}`;
  const cached = cacheGet<Awaited<ReturnType<typeof listPath>>>(cacheKey);
  if (cached) return NextResponse.json({ path, ...cached });

  try {
    const result = await listPath(path);
    cacheSet(cacheKey, result, FS_TTL_MS);
    return NextResponse.json({ path, ...result });
  } catch (err) {
    const e = err as Error;
    const msg = e.message || "Failed to list directory";
    if (msg.includes("No such")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json(
      { error: friendlyStorageError(err) },
      { status: 502 }
    );
  }
}
