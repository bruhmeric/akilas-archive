"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSize } from "@/lib/format";
import { TriangleAlert, FolderOpen, Files, Link2 } from "lucide-react";

type Stats = {
  buckets: {
    id: string;
    alias: string;
    name: string;
    served: boolean;
    files: number;
    size: number;
    truncated: boolean;
  }[];
  links: { total: number; redeemed: number; active: number };
};

export default function StatsCards({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) return;
        const data = (await res.json()) as Stats;
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) setError("Failed to load stats");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (error) {
    return (
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const totalFiles = stats?.buckets.reduce((a, b) => a + Math.max(0, b.files), 0) ?? 0;
  const totalSize = stats?.buckets.reduce((a, b) => a + b.size, 0) ?? 0;

  const cards = [
    {
      title: "Categories",
      icon: FolderOpen,
      value: stats ? `${stats.buckets.filter((b) => b.served).length} / ${stats.buckets.length}` : "…",
      sub: "served / configured",
    },
    {
      title: "Files indexed",
      icon: Files,
      value: stats ? totalFiles.toLocaleString() : "…",
      sub: stats?.buckets.some((b) => b.truncated) ? "some buckets hit scan limit" : "across all buckets",
    },
    {
      title: "Total size",
      icon: Files,
      value: stats ? formatSize(totalSize) : "…",
      sub: "sum of indexed objects",
    },
    {
      title: "One-time links",
      icon: Link2,
      value: stats ? `${stats.links.active} active` : "…",
      sub: `${stats?.links.redeemed ?? "…"} redeemed of ${stats?.links.total ?? "…"} created`,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.title} className="bg-black/50 border-emerald-900/60 text-neutral-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-emerald-600 flex items-center gap-2">
              <c.icon className="h-4 w-4" />
              {c.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats ? (
              <>
                <div className="text-2xl font-mono text-emerald-300">{c.value}</div>
                <p className="text-[11px] font-mono text-emerald-800 mt-1">{c.sub}</p>
              </>
            ) : (
              <Skeleton className="h-8 w-24 bg-emerald-950" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
