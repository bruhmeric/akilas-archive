import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { flatList, friendlyStorageError } from "@/lib/r2";
import { cacheGet, cacheSet } from "@/lib/cache";
import { getSettings } from "@/lib/settings";
import { formatSize, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const TREE_TTL_MS = 120_000;
const MAX_NODES = 800;
const MAX_DEPTH = 3;

type TreeNode = { name: string; dir: boolean; size?: number; children?: TreeNode[] };

function buildTree(
  keys: { key: string; size: number }[],
  prefix: string,
  depth: number
): { nodes: TreeNode[]; truncated: boolean } {
  const nodes: TreeNode[] = [];
  const seen = new Map<string, TreeNode>();
  const subDirs = new Map<string, { key: string; size: number }[]>();
  let count = 0;
  let truncated = false;

  for (const k of keys) {
    if (count >= MAX_NODES) {
      truncated = true;
      break;
    }
    if (!k.key.startsWith(prefix)) continue;
    const rest = k.key.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    if (slash === -1) {
      nodes.push({ name: rest, dir: false, size: k.size });
      count += 1;
    } else if (depth + 1 < MAX_DEPTH) {
      const dirName = rest.slice(0, slash);
      let dirNode = seen.get(dirName);
      if (!dirNode) {
        dirNode = { name: dirName, dir: true, children: [] };
        seen.set(dirName, dirNode);
        nodes.push(dirNode);
        count += 1;
      }
      const list = subDirs.get(dirName) || [];
      list.push(k);
      subDirs.set(dirName, list);
    }
  }

  for (const [name, childKeys] of subDirs) {
    const node = seen.get(name);
    if (!node) continue;
    const subPrefix = `${prefix}${name}/`;
    const built = buildTree(childKeys, subPrefix, depth + 1);
    node.children = built.nodes;
    if (built.truncated) truncated = true;
  }

  nodes.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  return { nodes, truncated };
}

function renderTree(nodes: TreeNode[], indent: string, lines: string[], budget: { n: number }) {
  for (const node of nodes) {
    if (budget.n <= 0) return;
    budget.n -= 1;
    const last = nodes.indexOf(node) === nodes.length - 1;
    const branch = last ? "└── " : "├── ";
    const label = node.dir
      ? node.name + "/"
      : `${node.name}  [${formatSize(node.size)}]`;
    lines.push(indent + branch + label);
    if (node.children && node.children.length) {
      renderTree(node.children, indent + (last ? "    " : "│   "), lines, budget);
    }
  }
}

export async function GET(req: NextRequest) {
  const path = (req.nextUrl.searchParams.get("path") || "/").replace(/^\/+|\/+$/g, "");
  const segments = path ? path.split("/") : [];
  if (path.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    if (segments.length === 0) {
      const buckets = await db.bucket.findMany({
        where: { served: true },
        orderBy: [{ sortOrder: "asc" }, { alias: "asc" }],
      });
      const lines = buckets.map((b) => `├── ${b.alias}/`);
      lines.push("");
      return NextResponse.json({ tree: lines.join("\n") });
    }

    const bucket = await db.bucket.findFirst({
      where: { alias: segments[0], served: true },
    });
    if (!bucket) {
      return NextResponse.json({ error: "No such file or directory" }, { status: 404 });
    }

    const settings = await getSettings();
    const cacheKey = `flat:${bucket.id}`;
    let flat = cacheGet<{ keys: { key: string; size: number }[]; truncated: boolean }>(cacheKey);
    if (!flat) {
      try {
        const res = await flatList(bucket, settings.searchScanLimit as number);
        flat = { keys: res.keys.map((k) => ({ key: k.key, size: k.size })), truncated: res.truncated };
      } catch (err) {
        return NextResponse.json({ error: friendlyStorageError(err) }, { status: 502 });
      }
      cacheSet(cacheKey, flat, TREE_TTL_MS);
    }

    const prefix = segments.slice(1).length ? `${segments.slice(1).join("/")}/` : "";
    const relevant = flat.keys.filter((k) => k.key.startsWith(prefix));
    const built = buildTree(relevant, prefix, 0);
    const lines: string[] = [`${path}/`];
    const budget = { n: MAX_NODES };
    renderTree(built.nodes, "", lines, budget);
    if (built.truncated || budget.n <= 0) {
      lines.push("");
      lines.push("... output truncated (use `find` for specific files)");
    }
    return NextResponse.json({ tree: lines.join("\n") });
  } catch (err) {
    const e = err as Error;
    return NextResponse.json({ error: e.message || "tree failed" }, { status: 500 });
  }
}
