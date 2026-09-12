/** Terminal types & pure helpers (client side) */

export type LineKind =
  | "input"
  | "output"
  | "error"
  | "success"
  | "dim"
  | "banner"
  | "link"
  | "dir"
  | "file";

export type Line = {
  id: number;
  kind: LineKind;
  text: string;
  /** clickable action executed when the line is clicked */
  action?: () => void;
};

export type DirEntry = {
  dir: boolean;
  key: string;
  name: string;
  size: number | null;
  lastModified: string | null;
};

export const COMMANDS = [
  "help",
  "ls",
  "cd",
  "pwd",
  "tree",
  "find",
  "search",
  "stat",
  "download",
  "cat",
  "clear",
  "history",
  "whoami",
  "hostname",
  "uname",
  "date",
  "echo",
  "neofetch",
  "banner",
  "motd",
  "admin",
  "sudo",
  "exit",
] as const;

export type CommandName = (typeof COMMANDS)[number];

export const HOSTNAME = "akilas-archive";
export const USER = "visitor";

/** Split a command string respecting quotes */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === " ") {
      if (cur) {
        tokens.push(cur);
        cur = "";
      }
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

/** Resolve a possibly-relative path against cwd, handling .. and . */
export function resolvePath(cwd: string, arg?: string): string {
  if (arg === undefined || arg === "" || arg === ".") return cwd || "/";
  let base = arg.startsWith("/") ? "" : cwd || "/";
  const parts = `${base}/${arg}`.split("/");
  const stack: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return "/" + stack.join("/");
}

export function promptFor(cwd: string): string {
  const display = cwd === "/" ? "~" : `~${cwd}`;
  return `${USER}@${HOSTNAME}:${display}$`;
}

const VIDEO = ["mkv", "mp4", "avi", "mov", "webm", "wmv", "flv", "m4v", "ts", "mpg", "mpeg"];
const AUDIO = ["mp3", "flac", "wav", "opus", "m4a", "aac", "ogg", "wma", "aiff"];
const ARCHIVE = ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"];
const IMAGE = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "svg"];
const DOC = ["pdf", "txt", "epub", "mobi", "azw3", "doc", "docx", "nfo", "md", "srt"];

export function fileClass(name: string): "video" | "audio" | "archive" | "image" | "doc" | "other" {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (VIDEO.includes(ext)) return "video";
  if (AUDIO.includes(ext)) return "audio";
  if (ARCHIVE.includes(ext)) return "archive";
  if (IMAGE.includes(ext)) return "image";
  if (DOC.includes(ext)) return "doc";
  return "other";
}

// ---------------- find/search argument parsing ----------------

export type FindArgs = {
  q: string;
  opts: Record<string, string | boolean>;
  error?: string;
};

const FIND_FLAGS_WITH_VALUE = [
  "in",
  "type",
  "ext",
  "larger",
  "smaller",
  "newer",
  "older",
  "sort",
  "limit",
] as const;

const FIND_BOOL_FLAGS = ["desc", "asc", "json", "help"] as const;

/**
 * Parse find/search CLI args.
 * Flags: --in --type --ext --larger --smaller --newer --older --sort --limit
 *        (value from the next token or --flag=value) and --desc --asc --json --help.
 * `--larger/--smaller` map to server params min/max; --desc/--asc set order.
 */
export function parseFindArgs(args: string[]): FindArgs {
  const q: string[] = [];
  const opts: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];

    if (a.startsWith("--")) {
      let key = a.slice(2);
      let val: string | undefined;
      const eq = key.indexOf("=");
      if (eq >= 0) {
        val = key.slice(eq + 1);
        key = key.slice(0, eq);
      }
      if ((FIND_BOOL_FLAGS as readonly string[]).includes(key)) {
        opts[key] = true;
        continue;
      }
      if (!(FIND_FLAGS_WITH_VALUE as readonly string[]).includes(key)) {
        return { q: "", opts, error: `unknown option '--${key}'` };
      }
      if (val === undefined) {
        val = args[++i];
        if (val === undefined) return { q: "", opts, error: `option '--${key}' needs a value` };
      }
      opts[key] = val;
      continue;
    }

    if (a.startsWith("-") && a.length > 1) {
      return { q: "", opts, error: `unknown option '${a}' (options use --)` };
    }
    q.push(a);
  }

  if (opts.larger) {
    opts.min = String(opts.larger);
    delete opts.larger;
  }
  if (opts.smaller) {
    opts.max = String(opts.smaller);
    delete opts.smaller;
  }
  if (opts.desc) opts.order = "desc";
  else if (opts.asc) opts.order = "asc";

  return { q: q.join(" "), opts };
}

export const FIND_HELP = [
  "find — search every served category  (`search` is an alias)",
  "",
  "usage: find [query] [options]",
  "       query = plain words (ALL must match) or a glob with * and ?",
  "",
  "options:",
  "  --in <category>     limit to one category (e.g. --in movies)",
  "  --type <t>          video | audio | image | archive | doc | other",
  "  --ext <list>        comma-separated extensions (e.g. --ext mkv,mp4)",
  "  --larger <size>     minimum size  (500, 500KB, 1.5GB, 2TB)",
  "  --smaller <size>    maximum size",
  "  --newer <when>      modified after  (30d, 12h, 2w, 6mo, 1y, 2024-01-01)",
  "  --older <when>      modified before",
  "  --sort <field>      relevance (default) | name | size | date",
  "  --desc              reverse sort order",
  "  --limit <n>         max results (default 300, max 1000)",
  "  --json              raw JSON lines instead of the table",
  "",
  "examples:",
  "  find plan 9                          all words must match",
  "  find *.mkv --larger 1GB --sort size --desc",
  "  find --type audio --ext flac --newer 30d",
  "  find season* --in tv-series --limit 50",
  "  find --in movies --sort date --desc --limit 10",
];
