/**
 * Seed/update the sandbox demo buckets so they point at the local mock S3
 * (scripts/mock-s3.ts). Dev-only helper — never needed in production.
 *
 * Usage: bun scripts/set-demo-endpoint.ts [endpoint]   (default http://127.0.0.1:9000)
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const ENDPOINT = process.argv[2] || "http://127.0.0.1:9000";

const DEMO_BUCKETS = [
  { alias: "movies", name: "akila-movies", description: "Films & cinema (demo data)" },
  { alias: "tv-series", name: "akila-tv", description: "Episodic shows (demo data)" },
  { alias: "music", name: "akila-music", description: "Albums & podcasts (demo data)" },
  { alias: "books", name: "akila-books", description: "Reading material (demo data)" },
];

async function main() {
  for (const d of DEMO_BUCKETS) {
    await db.bucket.upsert({
      where: { alias: d.alias },
      update: { endpoint: ENDPOINT, served: true },
      create: {
        ...d,
        accessKeyId: "mock-access-key",
        secretAccessKey: "mock-secret-key",
        endpoint: ENDPOINT,
        served: true,
      },
    });
    console.log(`bucket '${d.alias}' -> ${ENDPOINT}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
