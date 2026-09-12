/**
 * Mock S3 server for local development / E2E testing of Akila's Archive.
 *
 * Serves a small fake media library over the S3 API surface the app uses:
 *   - ListObjectsV2 (GET /<bucket>?list-type=2&prefix=&max-keys=&continuation-token=&encoding-type=url)
 *   - HeadObject     (HEAD /<bucket>/<key>)
 *   - GetObject      (GET /<bucket>/<key>?response-content-disposition=...)
 *
 * Auth headers are ignored — this is a dev tool, never run it in production.
 *
 * Usage:  bun scripts/mock-s3.ts [port]     (default 9000)
 */

const PORT = Number(process.argv[2] || process.env.MOCK_S3_PORT || 9000);

type FakeObject = { key: string; size: number; lastModified: string };

const daysAgo = (d: number) => new Date(Date.now() - d * 86400e3).toISOString();

const MB = 1024 * 1024;
const KB = 1024;

/** bucket name -> object catalog (keys are relative to the bucket root) */
const CATALOG: Record<string, FakeObject[]> = {
  "akila-movies": [
    { key: "Plan 9 from Outer Space (1959)/Plan.9.1959.1080p.BluRay.x264.mkv", size: 5589e6, lastModified: daysAgo(410) },
    { key: "The General (1926)/The.General.1926.720p.mp4", size: 2254e6, lastModified: daysAgo(388) },
    { key: "Big Buck Bunny (2008)/Big.Buck.Bunny.2008.1080p.mkv", size: 933e6, lastModified: daysAgo(300) },
    { key: "Night of the Living Dead (1968)/Night.of.the.Living.Dead.1968.mp4", size: 4614e6, lastModified: daysAgo(240) },
    { key: "His Girl Friday (1940)/extras/trailer.mp4", size: 220e6, lastModified: daysAgo(180) },
    { key: "House on Haunted Hill (1959)/House.on.Haunted.Hill.1959.mkv", size: 3460e6, lastModified: daysAgo(95) },
    { key: "Charade (1963)/Charade.1963.1080p.mkv", size: 6543e6, lastModified: daysAgo(40) },
    { key: "nfo/collection.nfo", size: 4 * KB, lastModified: daysAgo(12) },
    { key: "Charade (1963)/poster.jpg", size: 480 * KB, lastModified: daysAgo(40) },
  ],
  "akila-tv": [
    { key: "Sherlock Holmestead/S01/shermestead.s01e01.1080p.mkv", size: 1468e6, lastModified: daysAgo(200) },
    { key: "Sherlock Holmestead/S01/shermestead.s01e02.1080p.mkv", size: 1502e6, lastModified: daysAgo(193) },
    { key: "Sherlock Holmestead/S01/shermestead.s01e03.1080p.mkv", size: 1471e6, lastModified: daysAgo(186) },
    { key: "The Coffee Run/S01/the.coffee.run.s01e01.720p.mp4", size: 734e6, lastModified: daysAgo(150) },
    { key: "The Coffee Run/S01/the.coffee.run.s01e02.720p.mp4", size: 712e6, lastModified: daysAgo(143) },
    { key: "The Coffee Run/S02/the.coffee.run.s02e01.1080p.mkv", size: 1153e6, lastModified: daysAgo(21) },
    { key: "The Coffee Run/S02/the.coffee.run.s02e02.1080p.mkv", size: 1188e6, lastModified: daysAgo(3) },
    { key: "subs/the.coffee.run.s01.en.srt", size: 38 * KB, lastModified: daysAgo(140) },
  ],
  "akila-music": [
    { key: "Ambient Loops/morning fog.flac", size: 39e6, lastModified: daysAgo(90) },
    { key: "Ambient Loops/night drive.flac", size: 44e6, lastModified: daysAgo(90) },
    { key: "Jazz Cellar/take five.mp3", size: 9.4e6, lastModified: daysAgo(500) },
    { key: "Jazz Cellar/so what.mp3", size: 11.2e6, lastModified: daysAgo(500) },
    { key: "Podcasts/episode 42 - archives.mp3", size: 68e6, lastModified: daysAgo(7) },
    { key: "Podcasts/episode 43 - one time links.mp3", size: 71e6, lastModified: daysAgo(1) },
  ],
  "akila-books": [
    { key: "programming/the art of code.pdf", size: 12.5e6, lastModified: daysAgo(60) },
    { key: "programming/terminal basics.epub", size: 3.1e6, lastModified: daysAgo(55) },
    { key: "scifi/planet of sound.mobi", size: 6.4e6, lastModified: daysAgo(370) },
    { key: "scifi/the last archive.azw3", size: 5.2e6, lastModified: daysAgo(30) },
    { key: "readme.txt", size: 1.2 * KB, lastModified: daysAgo(2) },
  ],
};

const ALL_OBJECTS: Record<string, FakeObject[]> = {};
for (const [bucket, objs] of Object.entries(CATALOG)) {
  ALL_OBJECTS[bucket] = objs;
}

function catalogFor(bucket: string): FakeObject[] {
  return ALL_OBJECTS[bucket] || ALL_OBJECTS["akila-movies"];
}

function listXml(bucket: string, prefix: string, maxKeys: number, urlEncode: boolean): string {
  const objs = catalogFor(bucket)
    .filter((o) => !prefix || o.key.startsWith(prefix))
    .slice(0, Math.max(1, maxKeys));

  const enc = (s: string) => (urlEncode ? encodeURIComponent(s) : s);
  const contents = objs
    .map(
      (o) =>
        `<Contents><Key>${enc(o.key)}</Key><LastModified>${o.lastModified}</LastModified>` +
        `<ETag>&#34;${Math.abs(hash(o.key)).toString(16)}&#34;</ETag><Size>${Math.round(o.size)}</Size>` +
        `<StorageClass>STANDARD</StorageClass></Contents>`
    )
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
    `<Name>${bucket}</Name><Prefix>${enc(prefix)}</Prefix>` +
    `<KeyCount>${objs.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys>` +
    `<IsTruncated>false</IsTruncated>${urlEncode ? "<EncodingType>url</EncodingType>" : ""}` +
    `${contents}</ListBucketResult>`
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function contentTypeFor(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    mkv: "video/x-matroska",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    flac: "audio/flac",
    jpg: "image/jpeg",
    png: "image/png",
    pdf: "application/pdf",
    epub: "application/epub+zip",
    mobi: "application/x-mobipocket-ebook",
    azw3: "application/vnd.amazon.ebook",
    srt: "text/plain",
    nfo: "text/plain",
    txt: "text/plain",
  };
  return map[ext] || "application/octet-stream";
}

/** deterministic pseudo content, capped so demo downloads finish fast */
function objectBody(key: string, size: number): Buffer {
  const cap = Math.min(Math.max(Math.round(size), 64), 8 * 1024 * 1024);
  const buf = Buffer.alloc(cap);
  const seed = hash(key) || 1;
  for (let i = 0; i < cap; i += 4096) {
    buf[i] = (seed + i) & 0xff;
    if (i === 0) {
      buf.write(`AKILA-MOCK-S3 ${key}`, 0, Math.min(60, cap), "utf8");
    }
  }
  return buf;
}

const httpDate = (iso: string) => new Date(iso).toUTCString();

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = decodeURIComponent(url.pathname);
    const q = url.searchParams;

    const segments = path.split("/").filter(Boolean);
    const bucket = segments[0] || "";
    const key = segments.slice(1).join("/");

    // -------- ListBuckets (GET /) --------
    if (!bucket) {
      const all = [...new Set(Object.keys(ALL_OBJECTS))]
        .map((b) => `<Bucket><Name>${b}</Name></Bucket>`)
        .join("");
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Owner><ID>mock</ID><DisplayName>mock</DisplayName></Owner><Buckets>${all}</Buckets></ListAllMyBucketsResult>`,
        { headers: { "content-type": "application/xml" } }
      );
    }

    // -------- list operation --------
    if (!key) {
      const prefix = q.get("prefix") || "";
      const maxKeys = Number(q.get("max-keys") || 1000);
      const urlEncode = (q.get("encoding-type") || "") === "url";
      return new Response(listXml(bucket, prefix, maxKeys, urlEncode), {
        headers: { "content-type": "application/xml" },
      });
    }

    // -------- object operations --------
    const obj = catalogFor(bucket).find((o) => o.key === key);
    if (!obj) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message><Key>${key}</Key></Error>`,
        { status: 404, headers: { "content-type": "application/xml" } }
      );
    }

    if (req.method === "HEAD") {
      return new Response(null, {
        headers: {
          "content-length": String(Math.round(obj.size)),
          "content-type": contentTypeFor(key),
          "last-modified": httpDate(obj.lastModified),
          etag: `"${Math.abs(hash(key)).toString(16)}"`,
          "accept-ranges": "bytes",
        },
      });
    }

    // GET object
    const body = objectBody(key, obj.size);
    const headers: Record<string, string> = {
      "content-type": contentTypeFor(key),
      "content-length": String(body.length),
      "last-modified": httpDate(obj.lastModified),
      "accept-ranges": "bytes",
    };
    const disposition = q.get("response-content-disposition");
    if (disposition) headers["content-disposition"] = disposition;
    return new Response(body, { headers });
  },
});

console.log(`mock-s3 listening on http://127.0.0.1:${PORT}`);
console.log(`buckets: ${Object.keys(ALL_OBJECTS).join(", ")}`);
console.log(`objects: ${Object.values(ALL_OBJECTS).reduce((a, l) => a + l.length, 0)}`);
