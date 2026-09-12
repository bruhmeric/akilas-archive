"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMMANDS,
  HOSTNAME,
  USER,
  LineKind,
  DirEntry,
  tokenize,
  resolvePath,
  fileClass,
  parseFindArgs,
  FIND_HELP,
} from "./commands";
import { formatSize } from "@/lib/format";

let lineId = 0;
const nextId = () => ++lineId;

const BANNER = [
  "+===========================================+",
  "|     A K I L A ' S   A R C H I V E         |",
  "|           private media vault             |",
  "+===========================================+",
];

const BOOT_LINES = [
  "[  OK  ] Reached target archive.service",
  "[  OK  ] Mounted /archive — remote storage endpoints",
  "[  OK  ] Started one-time-link daemon",
  "[  OK  ] Loaded category index",
];

type FsRootResponse = {
  kind: "root";
  entries: { bucketId: string; bucketAlias: string }[];
  error?: string;
};

type FsBucketResponse = {
  kind: "bucket";
  listing: {
    bucketId: string;
    bucketAlias: string;
    prefix: string;
    entries: DirEntry[];
  };
  error?: string;
};

type TLine = {
  id: number;
  kind: LineKind;
  text: string;
  cwdAtExec?: string;
  href?: string;
  action?: () => void;
};

export default function Terminal() {
  const [lines, setLines] = useState<TLine[]>([]);
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState("/");
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cwdRef = useRef(cwd);
  const motdRef = useRef<string>("Welcome.");
  const bootedRef = useRef(false);
  // client-side directory cache for tab completion: path -> {dirs, files}
  const dirCache = useRef<Map<string, { dirs: string[]; files: string[] }>>(new Map());

  cwdRef.current = cwd;

  const push = useCallback((kind: LineKind, text: string, action?: () => void) => {
    setLines((prev) => [...prev, { id: nextId(), kind, text, action }]);
  }, []);

  const pushMany = useCallback((kind: LineKind, texts: string[]) => {
    setLines((prev) => [
      ...prev,
      ...texts.map((text) => ({ id: nextId(), kind, text })),
    ]);
  }, []);

  const echoInput = useCallback((text: string) => {
    setLines((prev) => [
      ...prev,
      { id: nextId(), kind: "input", text, cwdAtExec: cwdRef.current },
    ]);
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  useEffect(scrollToBottom, [lines, scrollToBottom]);

  // ---------------- boot sequence ----------------
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    let cancelled = false;

    (async () => {
      let meta: { motd?: string; servedBuckets?: number; host?: string } = {};
      try {
        const res = await fetch("/api/meta");
        meta = await res.json();
        if (!cancelled && meta.motd) motdRef.current = meta.motd;
      } catch {
        /* offline is fine for boot */
      }

      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      push("dim", "AkilaOS 1.0 — phosphor tty1 — " + (meta.host || HOSTNAME));
      await sleep(140);
      for (const b of BOOT_LINES) {
        if (cancelled) return;
        push("output", b);
        await sleep(100);
      }
      await sleep(100);
      if (cancelled) return;
      pushMany("banner", BANNER);
      push("dim", "");
      push("success", motdRef.current);
      push("dim", "");
      if ((meta.servedBuckets ?? 0) === 0) {
        push("dim", "No categories are being served yet.");
        push("dim", "Administrators can add buckets in the [admin] panel (top right).");
      } else {
        push("output", "Type `ls` to browse categories or `help` for all commands.");
      }
      push("dim", "");
      setBooting(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------- data helpers ----------------
  const fetchListing = useCallback(
    async (path: string): Promise<{ dirs: string[]; files: string[] } | null> => {
      const cached = dirCache.current.get(path);
      if (cached) return cached;
      try {
        const res = await fetch(`/api/fs?path=${encodeURIComponent(path)}`);
        const data = (await res.json()) as FsRootResponse | FsBucketResponse;
        if (!res.ok) return null;
        let out: { dirs: string[]; files: string[] };
        if (data.kind === "root") {
          out = { dirs: data.entries.map((e) => e.bucketAlias), files: [] };
        } else {
          out = {
            dirs: data.listing.entries.filter((e) => e.dir).map((e) => e.name),
            files: data.listing.entries.filter((e) => !e.dir).map((e) => e.name),
          };
        }
        dirCache.current.set(path, out);
        return out;
      } catch {
        return null;
      }
    },
    []
  );

  const printListing = useCallback(
    (path: string, data: FsRootResponse | FsBucketResponse) => {
      if (data.kind === "root") {
        const names = data.entries.map((e) => e.bucketAlias);
        if (names.length === 0) {
          push("dim", "total 0 — no categories are being served yet");
          return;
        }
        push("dim", `total ${names.length}`);
        for (const e of data.entries) {
          const name = e.bucketAlias + "/";
          push("dir", `drwxr-xr-x   ---             -  ${name}`, () => {
            runCommand(`cd ${e.bucketAlias}`);
          });
        }
        return;
      }

      const { entries } = data.listing;
      push("dim", `total ${entries.length}`);
      if (entries.length === 0) {
        push("dim", "(empty directory)");
        return;
      }
      for (const e of entries) {
        const date = e.lastModified
          ? e.lastModified.slice(0, 16).replace("T", " ")
          : "                ";
        if (e.dir) {
          push("dir", `drwxr-xr-x   ---  ${date}   ${e.name}/`, () => {
            runCommand(`cd "${e.name}"`);
          });
        } else {
          push("file", `-rw-r--r--  ${formatSize(e.size).padStart(7)}  ${date}   ${e.name}`, () => {
            runCommand(`download "${e.name}"`);
          });
        }
      }
    },
    [push]
  );

  // ---------------- command implementations ----------------
  const runCommand = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      const cwdAtExec = cwdRef.current;
      echoInput(trimmed);
      if (!trimmed) return;

      setHistory((h) => (h[h.length - 1] === trimmed ? h : [...h, trimmed]));
      setHistIdx(null);

      const tokens = tokenize(trimmed);
      const cmd = (tokens[0] || "").toLowerCase();
      const args = tokens.slice(1);
      const positional = args.filter((a) => !a.startsWith("-"));

      const fail = (msg: string) => push("error", msg);

      switch (cmd) {
        case "help": {
          pushMany("output", [
            "Akila's Archive — available commands:",
            "",
            "  ls [path]            list categories and files",
            "  cd <path>            change directory (cd .. to go up, cd / for root)",
            "  pwd                  print working directory",
            "  tree [path]          recursive tree view",
            "  find <query> [opts]  search everything — `search` is an alias",
            "                       filters: --in --type --ext --larger --smaller",
            "                                --newer --older --sort --limit --json",
            "  stat <file>          show file details",
            "  download <file>      generate a one-time download link",
            "",
            "  history              show command history",
            "  neofetch             system info",
            "  banner / motd        reprint banner / message of the day",
            "  admin                open the admin panel",
            "  clear                clear the screen",
            "",
            "Tips: Tab completes paths, ↑/↓ walks history, click a row to act on it.",
          ]);
          break;
        }

        case "ls": {
          const target = resolvePath(cwdAtExec, positional[0]);
          setBusy(true);
          try {
            const res = await fetch(`/api/fs?path=${encodeURIComponent(target)}`);
            const data = (await res.json()) as FsRootResponse | FsBucketResponse;
            if (!res.ok) {
              fail(`ls: ${data.error || "cannot access '" + target + "'"}`);
              break;
            }
            printListing(target, data);
          } catch {
            fail("ls: connection failed");
          } finally {
            setBusy(false);
          }
          break;
        }

        case "cd": {
          const target = resolvePath(cwdAtExec, positional[0] ?? "/");
          if (target === "/") {
            setCwd("/");
            break;
          }
          setBusy(true);
          try {
            const res = await fetch(`/api/fs?path=${encodeURIComponent(target)}`);
            const data = (await res.json()) as FsRootResponse | FsBucketResponse;
            if (!res.ok) {
              fail(`cd: ${data.error || `cannot access '${target}'`}`);
              break;
            }
            // seed the completion cache
            if (data.kind === "bucket") {
              dirCache.current.set(target, {
                dirs: data.listing.entries.filter((e) => e.dir).map((e) => e.name),
                files: data.listing.entries.filter((e) => !e.dir).map((e) => e.name),
              });
            }
            setCwd(target);
          } catch {
            fail("cd: connection failed");
          } finally {
            setBusy(false);
          }
          break;
        }

        case "pwd":
          push("output", cwdAtExec);
          break;

        case "tree": {
          const target = resolvePath(cwdAtExec, positional[0]);
          setBusy(true);
          try {
            const res = await fetch(`/api/tree?path=${encodeURIComponent(target)}`);
            const data = await res.json();
            if (!res.ok) {
              fail(`tree: ${data.error}`);
              break;
            }
            const chunks = String(data.tree).split("\n");
            for (const c of chunks) push(c.includes("[") ? "file" : "dir", c);
          } catch {
            fail("tree: connection failed");
          } finally {
            setBusy(false);
          }
          break;
        }

        case "find":
        case "search": {
          const parsed = parseFindArgs(args);
          if (parsed.error) {
            fail(`find: ${parsed.error} — try \`find --help\``);
            break;
          }
          if (parsed.opts.help) {
            pushMany("dim", FIND_HELP);
            break;
          }

          const params = new URLSearchParams();
          if (parsed.q) params.set("q", parsed.q);
          for (const key of ["in", "type", "ext", "min", "max", "newer", "older", "sort", "order", "limit"]) {
            const v = parsed.opts[key];
            if (typeof v === "string" && v) params.set(key, v);
          }
          const asJson = Boolean(parsed.opts.json);

          setBusy(true);
          try {
            const res = await fetch(`/api/search?${params.toString()}`);
            const data = await res.json();
            if (!res.ok) {
              fail(`find: ${data.error}`);
              break;
            }
            const hits = data.hits as {
              bucketAlias: string;
              key: string;
              name: string;
              size: number;
              lastModified: string;
            }[];

            if (asJson) {
              push(
                "dim",
                `${data.total}${data.truncated ? "+" : ""} result(s) — json lines (max 100 shown)`
              );
              for (const h of hits.slice(0, 100)) push("output", JSON.stringify(h));
              break;
            }

            const what = parsed.q ? `for '${parsed.q}'` : "(filter-only search)";
            push(
              "success",
              `${data.total}${data.truncated ? "+" : ""} result(s) ${what} — ${data.ms}ms, scanned ${data.scanned} file(s)`
            );
            for (const s of data.skipped as { alias: string; reason: string }[]) {
              push("dim", `  note: category '${s.alias}' skipped — ${s.reason}`);
            }
            if (hits.length === 0) {
              push("dim", "nothing matched — try fewer words or `find --help`");
              break;
            }
            const shown = hits.slice(0, 50);
            for (const h of shown) {
              const date = h.lastModified ? h.lastModified.slice(0, 10) : "-";
              push(
                "file",
                `  [${h.bucketAlias}] ${formatSize(h.size).padStart(8)}  ${date}  ${h.key}`,
                () => runCommand(`download "/${h.bucketAlias}/${h.key}"`)
              );
            }
            if (hits.length > shown.length) {
              push("dim", `  … ${hits.length - shown.length} more — raise --limit (max 1000)`);
            }
            if (data.scanTruncated) {
              push("dim", "  (results may be incomplete — scan limit reached)");
            }
            push("dim", "  tip: click a result to download — filters in `find --help`");
          } catch {
            fail("find: connection failed");
          } finally {
            setBusy(false);
          }
          break;
        }

        case "stat": {
          const target = resolvePath(cwdAtExec, positional[0]);
          if (!positional[0]) {
            fail("stat: missing operand — usage: stat <file>");
            break;
          }
          const parent = target.slice(0, target.lastIndexOf("/")) || "/";
          const name = target.slice(target.lastIndexOf("/") + 1);
          setBusy(true);
          try {
            const res = await fetch(`/api/fs?path=${encodeURIComponent(parent)}`);
            const data = (await res.json()) as FsRootResponse | FsBucketResponse;
            if (!res.ok) {
              fail(`stat: cannot stat '${target}': ${data.error}`);
              break;
            }
            if (data.kind === "root") {
              const bucket = data.entries.find((e) => e.bucketAlias === name);
              if (bucket) {
                pushMany("output", [
                  `  File: /${name}/`,
                  "  Type: category directory",
                  "  Access: one-time links only",
                ]);
              } else {
                fail(`stat: cannot stat '${target}': No such file or directory`);
              }
              break;
            }
            const entry = data.listing.entries.find((e) => e.name === name);
            if (!entry) {
              fail(`stat: cannot stat '${target}': No such file or directory`);
              break;
            }
            pushMany("output", [
              `  File: ${target}`,
              `  Type: ${entry.dir ? "directory" : fileClass(entry.name) + " file"}`,
              `  Size: ${entry.dir ? "-" : formatSize(entry.size)}`,
              `  Modified: ${entry.lastModified ? entry.lastModified.slice(0, 16).replace("T", " ") : "-"}`,
              "  Access: one-time links only (no public URLs)",
            ]);
          } catch {
            fail("stat: connection failed");
          } finally {
            setBusy(false);
          }
          break;
        }

        case "download":
        case "dl": {
          if (!positional[0]) {
            fail("download: missing file path — usage: download <file>");
            break;
          }
          const target = resolvePath(cwdAtExec, positional[0]);
          setBusy(true);
          try {
            const res = await fetch("/api/download", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ path: target }),
            });
            const data = await res.json();
            if (!res.ok) {
              fail(`download: ${data.error}`);
              break;
            }
            push("success", `one-time link created for '${data.fileName}' (${formatSize(data.size)})`);
            push("dim", "  single-use — file streams straight from storage, never from this server");
            setLines((prev) => [
              ...prev,
              {
                id: nextId(),
                kind: "link",
                text: `  ${data.url}`,
                href: data.url,
              },
            ]);
            // trigger the download via a hidden iframe (presigned URL forces attachment)
            const iframe = document.createElement("iframe");
            iframe.style.display = "none";
            iframe.src = data.url;
            document.body.appendChild(iframe);
            setTimeout(() => iframe.remove(), 60_000);
            push("dim", "  download started — if it didn't, click the link above");
          } catch {
            fail("download: connection failed");
          } finally {
            setBusy(false);
          }
          break;
        }

        case "cat": {
          fail(`cat: ${positional[0] || "file"}: binary file — media streaming is disabled, use \`download\``);
          break;
        }

        case "clear":
          setLines([]);
          break;

        case "history":
          history.forEach((h, i) => push("dim", `  ${String(i + 1).padStart(3)}  ${h}`));
          break;

        case "whoami":
          push("output", USER);
          break;

        case "hostname":
          push("output", HOSTNAME);
          break;

        case "uname":
          push("output", "AkilaOS 1.0.0-phosphor next16 x86_64 GNU/Linux");
          break;

        case "date":
          push("output", new Date().toString());
          break;

        case "echo":
          push("output", positional.join(" "));
          break;

        case "banner":
          pushMany("banner", BANNER);
          break;

        case "motd":
          push("success", motdRef.current);
          break;

        case "admin":
          push("output", "Opening admin panel…");
          window.open("/admin", "_blank");
          break;

        case "neofetch": {
          let bucketCount = "?";
          try {
            const res = await fetch("/api/meta");
            const meta = await res.json();
            bucketCount = String(meta.servedBuckets ?? "?");
          } catch {
            /* ignore */
          }
          const elapsed = Math.floor(performance.now() / 1000);
          const up = `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
          const art = [
            "   .--.      ",
            "  |o_o |     ",
            "  |:_/ |     ",
            " //   \\ \\    ",
            "(|     | )   ",
            "/'\\_ _/`\\    ",
            "\\___)=(___/  ",
          ];
          const info = [
            `${USER}@${HOSTNAME}`,
            "-----------------",
            "OS: AkilaOS 1.0 (phosphor)",
            "Kernel: next-16-edge",
            "Shell: aa-sh 1.0",
            "Storage: remote object storage",
            `Categories served: ${bucketCount}`,
            `Uptime (session): ${up}`,
            "Links: one-time only",
          ];
          const rows = Math.max(art.length, info.length);
          for (let i = 0; i < rows; i++) {
            push(i < 2 ? "banner" : "output", (art[i] || " ".repeat(12)) + (info[i] || ""));
          }
          break;
        }

        case "sudo":
          fail(`${USER} is not in the sudoers file. This incident has been reported. (nice try)`);
          break;

        case "exit":
          push("dim", "There is no escape from the archive. (close the tab if you must)");
          break;

        default:
          fail(`aa-sh: command not found: ${cmd} — type \`help\` for available commands`);
      }
    },
    [push, pushMany, echoInput, printListing, fetchListing, history]
  );

  // ---------------- tab completion ----------------
  const complete = useCallback(async () => {
    const tokens = tokenize(input);
    const endsWithSpace = input.endsWith(" ");
    const lastToken = endsWithSpace ? "" : tokens[tokens.length - 1] || "";
    const isFirst = tokens.length === 0 || (tokens.length === 1 && !endsWithSpace);

    if (isFirst) {
      const matches = COMMANDS.filter((c) => c.startsWith(lastToken.toLowerCase()));
      if (matches.length === 1) {
        setInput(matches[0] + " ");
      } else if (matches.length > 1) {
        echoInput(input);
        pushMany("dim", [matches.join("  ")]);
      }
      return;
    }

    // path completion
    const slash = lastToken.lastIndexOf("/");
    const dirPart = slash >= 0 ? lastToken.slice(0, slash) : "";
    const filePart = slash >= 0 ? lastToken.slice(slash + 1) : lastToken;
    const baseDir = resolvePath(cwdRef.current, dirPart || ".");
    const listing = await fetchListing(baseDir);
    if (!listing) return;

    const candidates = [
      ...listing.dirs.map((d) => d + "/"),
      ...listing.files.map((f) => f),
    ].filter((n) => n.toLowerCase().startsWith(filePart.toLowerCase()));

    if (candidates.length === 1) {
      const completed = (dirPart ? dirPart + "/" : "") + candidates[0];
      tokens[tokens.length - 1] = completed;
      setInput(tokens.join(" "));
    } else if (candidates.length > 1) {
      echoInput(input);
      pushMany("dim", [candidates.slice(0, 40).join("  ")]);
    }
  }, [input, pushMany, echoInput, fetchListing]);

  // ---------------- keyboard handling ----------------
  const onKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      await complete();
      return;
    }
    if (e.key === "Enter") {
      if (busy || booting) return;
      const value = input;
      setInput("");
      await runCommand(value);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const idx = histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1);
      if (histIdx === null) setDraft(input);
      setHistIdx(idx);
      setInput(history[idx]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === null) return;
      const idx = histIdx + 1;
      if (idx >= history.length) {
        setHistIdx(null);
        setInput(draft);
      } else {
        setHistIdx(idx);
        setInput(history[idx]);
      }
      return;
    }
    if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
      return;
    }
    if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      echoInput(input + "^C");
      setInput("");
    }
  };

  // ---------------- render ----------------
  const renderLine = (line: TLine) => {
    switch (line.kind) {
      case "input": {
        const display = line.cwdAtExec && line.cwdAtExec !== "/" ? `~${line.cwdAtExec}` : "~";
        return (
          <div key={line.id} className="flex flex-wrap break-all">
            <span className="text-emerald-400">
              {USER}@{HOSTNAME}
            </span>
            <span className="text-neutral-500">:</span>
            <span className="text-cyan-300">{display}</span>
            <span className="text-emerald-400">$&nbsp;</span>
            <span className="text-neutral-100">{line.text}</span>
          </div>
        );
      }
      case "error":
        return (
          <div key={line.id} className="text-red-400 break-all">
            {line.text}
          </div>
        );
      case "success":
        return (
          <div key={line.id} className="text-emerald-300 break-all">
            {line.text}
          </div>
        );
      case "dim":
        return (
          <div key={line.id} className="text-emerald-800 break-all">
            {line.text || "\u00A0"}
          </div>
        );
      case "banner":
        return (
          <div key={line.id} className="text-emerald-500 break-all select-all">
            {line.text}
          </div>
        );
      case "dir":
        return (
          <div
            key={line.id}
            className="text-sky-300 hover:bg-emerald-900/30 cursor-pointer break-all rounded-sm"
            onClick={line.action}
          >
            {line.text}
          </div>
        );
      case "file":
        return (
          <div
            key={line.id}
            className="text-neutral-200 hover:bg-emerald-900/30 cursor-pointer break-all rounded-sm"
            onClick={line.action}
          >
            {line.text}
          </div>
        );
      case "link":
        return (
          <div key={line.id} className="break-all">
            {line.href ? (
              <a
                href={line.href}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-300 underline decoration-emerald-800 hover:decoration-emerald-300"
              >
                {line.text}
              </a>
            ) : (
              <span className="text-emerald-800">{line.text}</span>
            )}
          </div>
        );
      default:
        return (
          <div key={line.id} className="text-neutral-200 break-all whitespace-pre-wrap">
            {line.text}
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 bg-[#050a07] text-sm sm:text-base overflow-hidden"
      onClick={() => inputRef.current?.focus()}
    >
      {/* status bar */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 py-1.5 bg-black/70 border-b border-emerald-900/60 text-[11px] sm:text-xs text-emerald-600 backdrop-blur">
        <div className="truncate">
          <span className="text-emerald-400">●</span> {USER}@{HOSTNAME} —
          akilasarchive.site
        </div>
        <a
          href="/admin"
          className="hover:text-emerald-300 underline decoration-dotted"
          onClick={(e) => e.stopPropagation()}
        >
          [admin]
        </a>
      </div>

      {/* output */}
      <div
        ref={scrollRef}
        className="terminal-scroll absolute inset-0 pt-9 pb-16 px-3 sm:px-5 overflow-y-auto font-mono leading-relaxed"
        aria-label="terminal output"
        role="log"
      >
        {lines.map(renderLine)}
        {busy && (
          <div className="text-emerald-600 animate-pulse" aria-live="polite">
            working<span className="animate-blink">…</span>
          </div>
        )}
      </div>

      {/* input */}
      <div className="absolute bottom-0 inset-x-0 z-10 bg-black/85 backdrop-blur border-t border-emerald-900/60 px-3 sm:px-5 py-3 font-mono flex items-center gap-2">
        <label htmlFor="terminal-input" className="sr-only">
          Terminal input
        </label>
        <span className="hidden sm:inline whitespace-nowrap text-sm">
          <span className="text-emerald-400">
            {USER}@{HOSTNAME}
          </span>
          <span className="text-neutral-500">:</span>
          <span className="text-cyan-300">{cwd === "/" ? "~" : `~${cwd}`}</span>
          <span className="text-emerald-400">$</span>
        </span>
        <span className="sm:hidden whitespace-nowrap text-sm text-emerald-400">$</span>
        <input
          id="terminal-input"
          ref={inputRef}
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={booting}
          className="flex-1 bg-transparent text-neutral-100 caret-emerald-400 outline-none min-w-0 placeholder:text-emerald-900 disabled:opacity-40"
          placeholder={booting ? "booting…" : ""}
          aria-label="terminal command input"
        />
      </div>

      {/* CRT scanlines overlay */}
      <div className="pointer-events-none absolute inset-0 z-20 scanlines" aria-hidden="true" />
    </div>
  );
}
