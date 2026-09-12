"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatSize, formatDate, formatDuration } from "@/lib/format";
import { Loader2, Ban, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type LinkRow = {
  id: string;
  token: string;
  fileName: string;
  fileSize: number | null;
  bucketAlias: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedIp: string | null;
  revoked: boolean;
};

function statusOf(l: LinkRow): { label: string; cls: string } {
  if (l.revoked) return { label: "revoked", cls: "border-neutral-700 text-neutral-400" };
  if (l.redeemedAt) return { label: "used once", cls: "border-emerald-700 text-emerald-400" };
  if (new Date(l.expiresAt).getTime() < Date.now())
    return { label: "expired", cls: "border-amber-800 text-amber-400" };
  const secs = (new Date(l.expiresAt).getTime() - Date.now()) / 1000;
  return { label: `active · ${formatDuration(secs)} left`, cls: "border-sky-800 text-sky-300" };
}

export default function LinkLog({ refreshKey }: { refreshKey: number }) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/links");
      if (!res.ok) return;
      const data = await res.json();
      setLinks(data.links);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const revoke = async (l: LinkRow) => {
    await fetch(`/api/admin/links/${l.id}`, { method: "DELETE" });
    load();
  };

  const copy = async (l: LinkRow) => {
    const url = `${window.location.origin}/api/dl/${l.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: url.slice(0, 60) + "…" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <p className="font-mono text-sm text-emerald-600">
        Every download generates a single-use token. After the first redemption the link
        returns HTTP 410 Gone.
      </p>
      <div className="rounded-lg border border-emerald-900/60 overflow-x-auto bg-black/50">
        <Table>
          <TableHeader>
            <TableRow className="border-emerald-900/60 hover:bg-transparent">
              <TableHead className="font-mono text-emerald-600">file</TableHead>
              <TableHead className="font-mono text-emerald-600 hidden md:table-cell">category</TableHead>
              <TableHead className="font-mono text-emerald-600 hidden lg:table-cell">size</TableHead>
              <TableHead className="font-mono text-emerald-600">status</TableHead>
              <TableHead className="font-mono text-emerald-600 hidden lg:table-cell">created</TableHead>
              <TableHead className="font-mono text-emerald-600 text-right">actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center font-mono text-emerald-700 py-8">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> loading…
                </TableCell>
              </TableRow>
            ) : links.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center font-mono text-emerald-700 py-8">
                  no links generated yet
                </TableCell>
              </TableRow>
            ) : (
              links.map((l) => {
                const st = statusOf(l);
                return (
                  <TableRow key={l.id} className="border-emerald-900/40">
                    <TableCell className="font-mono text-neutral-200 max-w-[240px] truncate">
                      {l.fileName}
                    </TableCell>
                    <TableCell className="font-mono text-sky-300 hidden md:table-cell">
                      /{l.bucketAlias}/
                    </TableCell>
                    <TableCell className="font-mono text-neutral-400 hidden lg:table-cell">
                      {formatSize(l.fileSize)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`font-mono text-[10px] ${st.cls}`}>
                        {st.label}
                      </Badge>
                      {l.redeemedIp && (
                        <div className="text-[10px] font-mono text-emerald-800 mt-0.5">
                          ip {l.redeemedIp}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-neutral-400 hidden lg:table-cell text-xs">
                      {formatDate(l.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        {!l.revoked && !l.redeemedAt && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copy(l)}
                              title="Copy link"
                              className="text-emerald-500 hover:text-emerald-300 hover:bg-emerald-950"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revoke(l)}
                              title="Revoke"
                              className="text-red-500 hover:text-red-300 hover:bg-red-950/40"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
