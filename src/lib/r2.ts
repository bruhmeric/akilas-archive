import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Bucket } from "@prisma/client";
import { db } from "@/lib/db";

export type BucketConfig = Pick<
  Bucket,
  "id" | "name" | "alias" | "accessKeyId" | "secretAccessKey" | "endpoint"
>;

/** Map low-level S3/network errors to a visitor-safe message */
export function friendlyStorageError(err: unknown): string {
  const raw =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : String(err);
  if (/Credentials|Signature|InvalidAccessKey|SecurityToken/i.test(raw)) {
    return "storage rejected the configured credentials (admin should verify the API token)";
  }
  if (/NoSuchBucket/i.test(raw)) {
    return "bucket no longer exists in the storage account";
  }
  if (/EPROTO|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|SSL|certificate|fetch failed|Network/i.test(raw)) {
    return "could not reach the storage endpoint for this category";
  }
  if (/AccessDenied|403/i.test(raw)) {
    return "storage denied access to this bucket (check token permissions)";
  }
  return "storage temporarily unavailable";
}

/** Build an S3 client pointed at a bucket's storage endpoint */
export function s3ClientFor(bucket: BucketConfig): S3Client {
  const endpoint =
    bucket.endpoint ||
    `https://${
      process.env.STORAGE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || "ACCOUNT_ID_NOT_SET"
    }.r2.cloudflarestorage.com`;
  return new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: bucket.accessKeyId,
      secretAccessKey: bucket.secretAccessKey,
    },
  });
}

export type R2Entry = {
  /** true = directory (common prefix), false = file */
  dir: boolean;
  /** directory: path without trailing slash, relative to bucket root. file: full key */
  key: string;
  name: string;
  size: number | null;
  lastModified: string | null;
};

/**
 * List one "directory" inside a bucket.
 * `prefix` is the object key prefix (must end with "/" or be empty).
 * Directories and files at that level are returned.
 */
export async function listDir(
  bucket: BucketConfig,
  prefix: string
): Promise<R2Entry[]> {
  const client = s3ClientFor(bucket);
  const dirs: R2Entry[] = [];
  const files: R2Entry[] = [];
  let token: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket.name,
        Prefix: prefix || undefined,
        Delimiter: "/",
        ContinuationToken: token,
        MaxKeys: 1000,
      })
    );
    for (const cp of res.CommonPrefixes || []) {
      const p = cp.Prefix || "";
      const dirKey = p.endsWith("/") ? p.slice(0, -1) : p;
      if (dirKey) {
        dirs.push({
          dir: true,
          key: dirKey,
          name: dirKey.split("/").pop() || dirKey,
          size: null,
          lastModified: null,
        });
      }
    }
    for (const obj of res.Contents || []) {
      const key = obj.Key || "";
      if (!key || key === prefix) continue;
      files.push({
        dir: false,
        key,
        name: key.split("/").pop() || key,
        size: obj.Size ?? null,
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

export type DirListing = {
  bucketId: string;
  bucketAlias: string;
  prefix: string;
  entries: R2Entry[];
};

/**
 * List a virtual filesystem path like "/movies/some/subdir".
 * Root ("/") lists all served buckets as directories.
 */
export async function listPath(
  path: string
): Promise<{ kind: "root"; entries: DirListing[] } | { kind: "bucket"; listing: DirListing }> {
  const buckets = await db.bucket.findMany({
    where: { served: true },
    orderBy: [{ sortOrder: "asc" }, { alias: "asc" }],
  });

  const clean = path.replace(/^\/+|\/+$/g, "");
  const segments = clean ? clean.split("/") : [];

  if (segments.length === 0) {
    return {
      kind: "root",
      entries: buckets.map((b) => ({
        bucketId: b.id,
        bucketAlias: b.alias,
        prefix: "",
        entries: [],
      })),
    };
  }

  const bucket = buckets.find((b) => b.alias === segments[0]);
  if (!bucket) throw new Error("No such file or directory");
  const subSegments = segments.slice(1);
  const prefix = subSegments.length ? `${subSegments.join("/")}/` : "";
  const entries = await listDir(bucket, prefix);
  return {
    kind: "bucket",
    listing: {
      bucketId: bucket.id,
      bucketAlias: bucket.alias,
      prefix,
      entries,
    },
  };
}

/** Resolve a virtual path to the bucket + object key for a FILE */
export async function resolveFile(
  path: string
): Promise<{ bucket: Bucket; key: string; name: string }> {
  const clean = path.replace(/^\/+|\/+$/g, "");
  const segments = clean.split("/");
  if (segments.length < 2) throw new Error("Not a file");

  const bucket = await db.bucket.findFirst({
    where: { alias: segments[0], served: true },
  });
  if (!bucket) throw new Error("No such file or directory");

  const key = segments.slice(1).join("/");
  if (!key) throw new Error("Not a file");
  return { bucket, key, name: key.split("/").pop() || key };
}

export async function headObject(bucket: Bucket, key: string) {
  const client = s3ClientFor(bucket);
  return client.send(new HeadObjectCommand({ Bucket: bucket.name, Key: key }));
}

/** Create a short-lived presigned GET URL that streams straight from storage */
export async function presignDownload(
  bucket: Bucket,
  key: string,
  expiresSeconds: number,
  fileName?: string
) {
  const client = s3ClientFor(bucket);
  // Force the browser to download (not stream) with a sane filename
  let responseContentDisposition: string | undefined;
  if (fileName) {
    const clean = fileName.replace(/[\r\n"\\]/g, "").trim() || "download";
    const asciiFallback = clean.replace(/[^\x20-\x7E]/g, "_") || "download";
    responseContentDisposition = `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
  }
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket.name,
      Key: key,
      ResponseContentDisposition: responseContentDisposition,
    }),
    { expiresIn: Math.max(10, Math.min(3600, expiresSeconds)) }
  );
}

/** Quick connectivity test: can we list the bucket? */
export async function testBucket(bucket: {
  name: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string | null;
}): Promise<{ ok: boolean; message: string; objectCount?: number }> {
  try {
    const client = s3ClientFor(bucket);
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket.name, MaxKeys: 1 })
    );
    return {
      ok: true,
      message: "Connection successful",
      objectCount: res.KeyCount ?? 0,
    };
  } catch (err) {
    const e = err as Error;
    return { ok: false, message: e.name === "NoSuchBucket" ? "Bucket does not exist" : e.message || "Connection failed" };
  }
}

/**
 * Fetch (and cache) the full flat key list of a bucket, used for search/tree/stats.
 */
export type FlatKey = { key: string; size: number; lastModified: string };

export async function flatList(
  bucket: BucketConfig,
  scanLimit: number
): Promise<{ keys: FlatKey[]; truncated: boolean }> {
  const client = s3ClientFor(bucket);
  const keys: FlatKey[] = [];
  let token: string | undefined;
  let truncated = false;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket.name,
        ContinuationToken: token,
        MaxKeys: 1000,
      })
    );
    for (const obj of res.Contents || []) {
      if (!obj.Key) continue;
      keys.push({
        key: obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : "",
      });
      if (keys.length >= scanLimit) {
        truncated = true;
        break;
      }
    }
    token = res.IsTruncated && !truncated ? res.NextContinuationToken : undefined;
  } while (token);

  return { keys, truncated };
}
