/**
 * Self-test for the pure search engine (src/lib/search.ts) and the terminal
 * find-args parser (src/components/terminal/commands.ts).
 *
 * Run: bun scripts/search-selftest.ts
 */
import assert from "node:assert/strict";
import {
  parseSize,
  parseSince,
  hasGlob,
  globToRegExp,
  scoreKey,
  passesFilters,
  sortHits,
  typeOfExt,
  extOf,
  SearchHit,
} from "../src/lib/search";
import { parseFindArgs } from "../src/components/terminal/commands";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// ---------------- parseSize ----------------
ok("parseSize: bare number", () => assert.equal(parseSize("500"), 500));
ok("parseSize: KB", () => assert.equal(parseSize("500KB"), 500 * 1024));
ok("parseSize: fractional GB", () => assert.equal(parseSize("1.5GB"), Math.round(1.5 * 1024 ** 3)));
ok("parseSize: TB case-insensitive + space", () => assert.equal(parseSize("2 tb"), Math.round(2 * 1024 ** 4)));
ok("parseSize: MiB style", () => assert.equal(parseSize("10MiB"), 10 * 1024 ** 2));
ok("parseSize: garbage -> null", () => assert.equal(parseSize("abc"), null));
ok("parseSize: negative -> null", () => assert.equal(parseSize("-5MB"), null));

// ---------------- parseSince ----------------
ok("parseSince: 30d -> ISO ~30 days ago", () => {
  const iso = parseSince("30d")!;
  const age = Date.now() - new Date(iso).getTime();
  assert.ok(age > 29 * 86400e3 && age < 31 * 86400e3);
});
ok("parseSince: 12h", () => {
  const age = Date.now() - new Date(parseSince("12h")!).getTime();
  assert.ok(age > 11 * 3600e3 && age < 13 * 3600e3);
});
ok("parseSince: 6mo", () => {
  const age = Date.now() - new Date(parseSince("6mo")!).getTime();
  assert.ok(age > 175 * 86400e3 && age < 185 * 86400e3);
});
ok("parseSince: absolute date", () => assert.equal(parseSince("2024-01-01"), new Date("2024-01-01").toISOString()));
ok("parseSince: garbage -> null", () => assert.equal(parseSince("whenever"), null));

// ---------------- glob ----------------
ok("hasGlob detects * and ?", () => {
  assert.equal(hasGlob("plain"), false);
  assert.equal(hasGlob("*.mkv"), true);
  assert.equal(hasGlob("s01e0?"), true);
});
ok("glob: *.mkv matches path + name", () => {
  const re = globToRegExp("*.mkv");
  assert.ok(re.test("movies/Big Buck Bunny/Big.Buck.Bunny.2008.1080p.mkv"));
  assert.ok(!re.test("music/take five.mp3"));
});
ok("glob: ? matches exactly one char", () => {
  const re = globToRegExp("s01e0?");
  assert.ok(re.test("s01e01"));
  assert.ok(!re.test("s01e010"));
});
ok("glob: regex specials are escaped", () => {
  const re = globToRegExp("c++ (1)");
  assert.ok(re.test("c++ (1)"));
  assert.ok(!re.test("c++ 1"));
});

// ---------------- scoring ----------------
const name = (key: string) => key.split("/").pop()!;
ok("exact name match beats prefix beats contains beats path", () => {
  const q = ["plan"];
  const exact = scoreKey("m/plan", name("plan"), q, null);
  const prefix = scoreKey("m/plan 9.mkv", name("plan 9.mkv"), q, null);
  const contains = scoreKey("m/the plan.mkv", name("the plan.mkv"), q, null);
  const pathOnly = scoreKey("plan 9/poster.jpg", name("poster.jpg"), q, null);
  assert.ok(exact > prefix && prefix > contains && contains > pathOnly);
});
ok("AND semantics: missing term rejects", () => {
  assert.equal(scoreKey("m/plan 9.mkv", name("plan 9.mkv"), ["plan", "zombie"], null), -1);
});
ok("glob mode: name match outranks path match", () => {
  const byName = scoreKey("tv/ep.mkv", name("ep.mkv"), [], globToRegExp("ep*"));
  const byPath = scoreKey("tv/ep.mkv", name("ep.mkv"), [], globToRegExp("tv/*"));
  assert.ok(byName === 90 && byPath === 60);
});
ok("non-matching glob -> -1", () => {
  assert.equal(scoreKey("m/a.mkv", name("a.mkv"), [], globToRegExp("*.iso")), -1);
});

// ---------------- filters ----------------
const hit = { key: "m/x", name: "video.mkv", size: 500e6, lastModified: "2024-06-01T00:00:00.000Z" };
ok("type filter passes matching class", () => {
  assert.ok(passesFilters(hit, { type: typeOfExt("mkv") }));
});
ok("type filter rejects other class", () => {
  assert.ok(!passesFilters(hit, { type: "audio" }));
});
ok("ext filter", () => {
  assert.ok(passesFilters(hit, { exts: ["mkv", "mp4"] }));
  assert.ok(!passesFilters(hit, { exts: ["mp4"] }));
});
ok("size filters", () => {
  assert.ok(passesFilters(hit, { minSize: 100e6, maxSize: 600e6 }));
  assert.ok(!passesFilters(hit, { minSize: 600e6 }));
});
ok("date filters", () => {
  assert.ok(passesFilters(hit, { newer: "2024-01-01T00:00:00.000Z", older: "2025-01-01T00:00:00.000Z" }));
  assert.ok(!passesFilters(hit, { newer: "2025-01-01T00:00:00.000Z" }));
});

// ---------------- sorting ----------------
const hits: SearchHit[] = [
  { bucketAlias: "a", key: "1", name: "b.mkv", size: 300, lastModified: "2024-03-01", score: 60 },
  { bucketAlias: "a", key: "2", name: "a.mkv", size: 500, lastModified: "2024-05-01", score: 100 },
  { bucketAlias: "a", key: "3", name: "c.mkv", size: 100, lastModified: "2024-01-01", score: 100 },
];
ok("sort by relevance desc then name", () => {
  const s = sortHits(hits, "relevance", false);
  assert.deepEqual(s.map((h) => h.name), ["a.mkv", "c.mkv", "b.mkv"]);
});
ok("sort by size desc", () => {
  const s = sortHits(hits, "size", true);
  assert.deepEqual(s.map((h) => h.size), [500, 300, 100]);
});
ok("sort by date asc", () => {
  const s = sortHits(hits, "date", false);
  assert.deepEqual(s.map((h) => h.lastModified), ["2024-01-01", "2024-03-01", "2024-05-01"]);
});
ok("sort by name numeric-aware", () => {
  const s = sortHits(
    [
      { bucketAlias: "a", key: "1", name: "ep 10.mkv", size: 1, lastModified: "", score: 0 },
      { bucketAlias: "a", key: "2", name: "ep 2.mkv", size: 1, lastModified: "", score: 0 },
    ],
    "name",
    false
  );
  assert.deepEqual(s.map((h) => h.name), ["ep 2.mkv", "ep 10.mkv"]);
});

// ---------------- ext/type helpers ----------------
ok("extOf", () => assert.equal(extOf("Big.Buck.Bunny.2008.1080p.mkv"), "mkv"));
ok("typeOfExt classes", () => {
  assert.equal(typeOfExt("flac"), "audio");
  assert.equal(typeOfExt("pdf"), "doc");
  assert.equal(typeOfExt("zip"), "archive");
  assert.equal(typeOfExt("bin"), "other");
});

// ---------------- find CLI arg parsing ----------------
ok("parseFindArgs: plain query", () => {
  const r = parseFindArgs(["plan", "9"]);
  assert.equal(r.q, "plan 9");
  assert.deepEqual(r.opts, {});
});
ok("parseFindArgs: flags with values", () => {
  const r = parseFindArgs(["*.mkv", "--larger", "1GB", "--in", "movies", "--sort", "size", "--desc"]);
  assert.equal(r.q, "*.mkv");
  assert.equal(r.opts.min, "1GB");
  assert.equal(r.opts.in, "movies");
  assert.equal(r.opts.sort, "size");
  assert.equal(r.opts.order, "desc");
});
ok("parseFindArgs: --flag=value form", () => {
  const r = parseFindArgs(["--type=video", "hero"]);
  assert.equal(r.opts.type, "video");
  assert.equal(r.q, "hero");
});
ok("parseFindArgs: filter-only search", () => {
  const r = parseFindArgs(["--type", "audio"]);
  assert.equal(r.q, "");
  assert.equal(r.opts.type, "audio");
});
ok("parseFindArgs: unknown flag errors", () => {
  assert.match(parseFindArgs(["--bogus"]).error!, /unknown option '--bogus'/);
});
ok("parseFindArgs: missing value errors", () => {
  assert.match(parseFindArgs(["--in"]).error!, /needs a value/);
});
ok("parseFindArgs: single dash rejected", () => {
  assert.match(parseFindArgs(["-x"]).error!, /options use --/);
});
ok("parseFindArgs: --json and --help booleans", () => {
  const r = parseFindArgs(["q", "--json", "--help"]);
  assert.equal(r.opts.json, true);
  assert.equal(r.opts.help, true);
});

console.log(`\n${passed} checks passed`);
