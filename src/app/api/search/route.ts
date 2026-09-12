import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { flatList, friendlyStorageError } from "@/lib/r2";
import { cacheGet, cacheSet } from "@/lib/cache";
import { getSettings } from "@/lib/settings";
import {
  FILE_TYPES,
  SORT_FIELDS,
  SortField,
  SearchHit,
  globToRegExp,
  hasGlob,
  parseSince,
  parseSize,
  passesFilters,
  scoreKey,
  sortHits,
} from "@/lib/search";

export const dynamic = "force-dynamic";

const SEARCH_TTL_MS = 300_000;
const MAX_LIMIT = 1000;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const q = (sp.get("q") || "").trim();
  const qLower = q.toLowerCase();
  const inBucket = (sp.get("in") || "").trim().toLowerCase();
  const type = (sp.get("type") || "").trim().toLowerCase();
  const sort = ((sp.get("sort") || "relevance") as string).toLowerCase();
  const order = (sp.get("order") || "").trim().toLowerCase();
  const limitRaw = Number(sp.get("limit") || 300);

  // ---------- validation ----------
  if (type && !(type in FILE_TYPES) && type !== "other") {
    return NextResponse.json(
      { error: `unknown --type '${type}' — valid: ${Object.keys(FILE_TYPES).join(", ")}, other` },
      { status: 400 }
    );
  }
  if (!SORT_FIELDS.includes(sort as SortField)) {
    return NextResponse.json(
      { error: `unknown --sort '${sort}' — valid: ${SORT_FIELDS.join(", ")}` },
      { status: 400 }
    );
  }
  const desc = order ? order === "desc" : sort === "relevance"; // relevance defaults to best-first

  let minSize: number | null = null;
  let maxSize: number | null = null;
  let newer: string | null = null;
  let older: string | null = null;
  try {
    const minRaw = (sp.get("min") || "").trim();
    if (minRaw) {
      minSize = parseSize(minRaw);
      if (minSize == null) throw new Error(`invalid size '${minRaw}' — try --larger 500MB`);
    }
    const maxRaw = (sp.get("max") || "").trim();
    if (maxRaw) {
      maxSize = parseSize(maxRaw);
      if (maxSize == null) throw new Error(`invalid size '${maxRaw}' — try --smaller 2GB`);
    }
    const newerRaw = (sp.get("newer") || "").trim();
    if (newerRaw) {
      newer = parseSince(newerRaw);
      if (!newer) throw new Error(`invalid date '${newerRaw}' — try --newer 30d or 2024-01-01`);
    }
    const olderRaw = (sp.get("older") || "").trim();
    if (olderRaw) {
      older = parseSince(olderRaw);
      if (!older) throw new Error(`invalid date '${olderRaw}' — try --older 7d or 2023-06-01`);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const exts = (sp.get("ext") || "")
    .split(",")
    .map((e) => e.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 300));

  const filterCount = [inBucket, type, exts.length > 0, minSize != null, maxSize != null, newer, older].filter(
    Boolean
  ).length;

  if (qLower.length < 2 && filterCount === 0) {
    return NextResponse.json(
      { error: "query too short (min 2 chars) — or add a filter like --type video" },
      { status: 400 }
    );
  }

  // ---------- matching setup ----------
  const glob = qLower.length >= 2 && hasGlob(qLower) ? globToRegExp(qLower) : null;
  const terms = glob ? [] : qLower.split(/\s+/).filter(Boolean);

  const t0 = Date.now();
  const hits: SearchHit[] = [];
  let scanned = 0;
  let scanTruncated = false;
  const skipped: { alias: string; reason: string }[] = [];

  try {
    const dbBuckets = await db.bucket.findMany({
      where: { served: true },
      orderBy: [{ sortOrder: "asc" }, { alias: "asc" }],
    });

    if (inBucket && !dbBuckets.some((b) => b.alias === inBucket)) {
      return NextResponse.json(
        { error: `unknown category '${inBucket}' — served: ${dbBuckets.map((b) => b.alias).join(", ") || "none"}` },
        { status: 400 }
      );
    }

    const settings = await getSettings();
    const scanLimit = Math.max(1000, Number(settings.searchScanLimit) || 20000);

    for (const bucket of dbBuckets) {
      if (inBucket && bucket.alias !== inBucket) continue;

      const cacheKey = `flat:${bucket.id}`;
      let flat = cacheGet<Awaited<ReturnType<typeof flatList>>>(cacheKey);
      if (!flat) {
        try {
          flat = await flatList(bucket, scanLimit);
        } catch (e) {
          // skip buckets we cannot reach, but keep searching the rest
          skipped.push({ alias: bucket.alias, reason: friendlyStorageError(e) });
          continue;
        }
        cacheSet(cacheKey, flat, SEARCH_TTL_MS);
      }
      if (flat.truncated) scanTruncated = true;
      scanned += flat.keys.length;

      for (const k of flat.keys) {
        const name = k.key.split("/").pop() || k.key;
        const score = scoreKey(k.key, name, terms, glob);
        if (score < 0) continue;
        hits.push({
          bucketAlias: bucket.alias,
          key: k.key,
          name,
          size: k.size,
          lastModified: k.lastModified,
          score,
        });
      }
    }

    // ---------- post filters ----------
    const filtered = hits.filter((h) =>
      passesFilters(h, { type: type || undefined, exts: exts.length ? exts : undefined, minSize, maxSize, newer, older })
    );

    const sorted = sortHits(filtered, sort as SortField, desc);
    const total = sorted.length;

    return NextResponse.json({
      hits: sorted.slice(0, limit),
      total,
      truncated: total > limit || scanTruncated,
      scanTruncated,
      scanned,
      skipped,
      ms: Date.now() - t0,
      sort,
      order: desc ? "desc" : "asc",
      glob: Boolean(glob),
    });
  } catch (err) {
    const e = err as Error;
    return NextResponse.json({ error: e.message || "search failed" }, { status: 500 });
  }
}
