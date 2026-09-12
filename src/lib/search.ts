/**
 * Pure, dependency-free search engine.
 * Shared by the /api/search route (server) and the terminal UI (client),
 * so both sides validate/present options identically.
 */

export type SearchHit = {
  bucketAlias: string;
  /** full object key inside the bucket, e.g. "movies/Plan 9 (1959)/file.mkv" */
  key: string;
  /** last path segment */
  name: string;
  size: number;
  lastModified: string;
  /** relevance score, higher = better (only meaningful when sorting by relevance) */
  score?: number;
};

export type SortField = "relevance" | "name" | "size" | "date";

export const SORT_FIELDS: SortField[] = ["relevance", "name", "size", "date"];

export const FILE_TYPES: Record<string, string[]> = {
  video: ["mkv", "mp4", "avi", "mov", "webm", "wmv", "flv", "m4v", "ts", "mpg", "mpeg"],
  audio: ["mp3", "flac", "wav", "opus", "m4a", "aac", "ogg", "wma", "aiff"],
  image: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "svg"],
  archive: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"],
  doc: ["pdf", "txt", "epub", "mobi", "azw3", "doc", "docx", "nfo", "md", "srt"],
};

export const TYPE_NAMES = [...Object.keys(FILE_TYPES), "other"];

/** Extension without dot, lowercase */
export function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : "";
}

/** Coarse file class by extension; "other" when nothing matches */
export function typeOfExt(ext: string): string {
  for (const [type, exts] of Object.entries(FILE_TYPES)) {
    if (exts.includes(ext)) return type;
  }
  return "other";
}

/**
 * Parse a human size like "500", "500KB", "1.5GB", "2TiB" into bytes (1024-based).
 * Returns null when unparseable.
 */
export function parseSize(input: string): number | null {
  const m = /^([\d.]+)\s*([kmgtp]?i?b?)?$/i.exec(input.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  const unit = (m[2] || "").toLowerCase().replace("i", "").replace("b", "");
  const mult: Record<string, number> = { "": 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4, p: 1024 ** 5 };
  return Math.round(n * mult[unit]);
}

/**
 * Parse a date filter token into an ISO cutoff string.
 * Relative: "30d" days, "12h" hours, "2w" weeks, "6mo" months, "1y" years.
 * Absolute: "2024-01-01" or any parseable ISO date.
 * Returns null when unparseable.
 */
export function parseSince(input: string): string | null {
  const s = input.trim().toLowerCase();
  const rel = /^(\d+)\s*(h|d|w|mo|y)$/.exec(s);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    const ms = { h: 3600e3, d: 86400e3, w: 7 * 86400e3, mo: 30 * 86400e3, y: 365 * 86400e3 }[unit]!;
    return new Date(Date.now() - n * ms).toISOString();
  }
  const d = new Date(input.trim());
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

/** True when the query uses glob wildcards */
export function hasGlob(q: string): boolean {
  return /[*?]/.test(q);
}

/**
 * Translate a glob pattern (* matches any run incl. "/", ? matches one char)
 * into a case-insensitive anchored RegExp. Falls back to a literal matcher
 * when the pattern is malformed.
 */
export function globToRegExp(pattern: string): RegExp {
  let out = "";
  for (const ch of pattern) {
    if (ch === "*") out += ".*";
    else if (ch === "?") out += ".";
    else out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  try {
    return new RegExp(`^${out}$`, "i");
  } catch {
    return new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  }
}

/**
 * Score one object against the query.
 * terms mode: every term must match (name or full key); score = sum of best per-term score.
 * glob mode: whole pattern must match key or name.
 * Returns -1 when the object does not match.
 */
export function scoreKey(
  key: string,
  name: string,
  terms: string[],
  glob: RegExp | null
): number {
  const keyL = key.toLowerCase();
  const nameL = name.toLowerCase();

  if (glob) {
    if (glob.test(nameL)) return 90;
    if (glob.test(keyL)) return 60;
    return -1;
  }

  let total = 0;
  for (const term of terms) {
    let best = -1;
    if (nameL === term) best = 100;
    else if (nameL.startsWith(term)) best = 80;
    else if (new RegExp(`\\b${escapeRe(term)}`).test(nameL)) best = 70;
    else if (nameL.includes(term)) best = 60;
    else if (keyL.includes(term)) best = 40;
    if (best < 0) return -1;
    total += best;
  }
  // tiny bonus for shorter names (more precise hits float up on ties)
  return total + Math.max(0, 10 - Math.floor(nameL.length / 16));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type HitFilters = {
  type?: string; // FILE_TYPES key or "other"
  exts?: string[]; // normalized, no dots
  minSize?: number | null;
  maxSize?: number | null;
  newer?: string | null; // ISO cutoff
  older?: string | null; // ISO cutoff
};

/** True when the hit passes every supplied filter */
export function passesFilters(
  hit: { key: string; name: string; size: number; lastModified: string },
  f: HitFilters
): boolean {
  if (f.type) {
    const t = typeOfExt(extOf(hit.name));
    if (t !== f.type) return false;
  }
  if (f.exts && f.exts.length > 0) {
    const e = extOf(hit.name);
    if (!f.exts.includes(e)) return false;
  }
  if (f.minSize != null && hit.size < f.minSize) return false;
  if (f.maxSize != null && hit.size > f.maxSize) return false;
  if (f.newer && (!hit.lastModified || hit.lastModified < f.newer)) return false;
  if (f.older && (!hit.lastModified || hit.lastModified > f.older)) return false;
  return true;
}

/** Sort hits in place-ish (returns new array). relevance = score desc, name asc. */
export function sortHits(hits: SearchHit[], sort: SortField, desc: boolean): SearchHit[] {
  const arr = [...hits];
  const dir = desc ? -1 : 1;
  switch (sort) {
    case "name":
      arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) * dir);
      break;
    case "size":
      arr.sort((a, b) => (a.size - b.size) * dir);
      break;
    case "date":
      arr.sort((a, b) => (a.lastModified || "").localeCompare(b.lastModified || "") * dir);
      break;
    default:
      arr.sort(
        (a, b) =>
          (b.score || 0) - (a.score || 0) ||
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
      );
  }
  return arr;
}
