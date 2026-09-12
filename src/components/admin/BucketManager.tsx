"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatSize } from "@/lib/format";
import { Loader2, Plus, Pencil, Trash2, PlugZap } from "lucide-react";

type BucketRow = {
  id: string;
  name: string;
  alias: string;
  description: string | null;
  endpoint: string | null;
  served: boolean;
  accessKeyId: string;
  files?: number;
  size?: number;
};

type TestResult = { ok: boolean; message: string } | null;

const emptyForm = {
  id: "",
  alias: "",
  name: "",
  accessKeyId: "",
  secretAccessKey: "",
  endpoint: "",
  description: "",
};

export default function BucketManager({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [buckets, setBuckets] = useState<BucketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [deleting, setDeleting] = useState<BucketRow | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/buckets");
      if (!res.ok) return;
      const data = await res.json();
      setBuckets(data.buckets);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const openAdd = () => {
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (b: BucketRow) => {
    setForm({
      id: b.id,
      alias: b.alias,
      name: b.name,
      accessKeyId: b.accessKeyId,
      secretAccessKey: "",
      endpoint: b.endpoint || "",
      description: b.description || "",
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const isEdit = Boolean(form.id);
      const res = await fetch(isEdit ? `/api/admin/buckets/${form.id}` : "/api/admin/buckets", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Save failed");
        return;
      }
      setDialogOpen(false);
      load();
      onChanged();
    } catch {
      setFormError("Connection failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleServed = async (b: BucketRow, served: boolean) => {
    setBuckets((prev) => prev.map((x) => (x.id === b.id ? { ...x, served } : x)));
    await fetch(`/api/admin/buckets/${b.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ served }),
    });
    onChanged();
  };

  const test = async (b: BucketRow) => {
    setTesting(b.id);
    try {
      const res = await fetch(`/api/admin/buckets/${b.id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [b.id]: res.ok ? { ok: data.ok, message: data.message } : { ok: false, message: data.error || "Test failed" },
      }));
    } catch {
      setTestResults((prev) => ({ ...prev, [b.id]: { ok: false, message: "Connection failed" } }));
    } finally {
      setTesting(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    await fetch(`/api/admin/buckets/${deleting.id}`, { method: "DELETE" });
    setDeleting(null);
    load();
    onChanged();
  };

  const setField = (k: keyof typeof emptyForm, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm text-emerald-600">
          Each bucket becomes a top-level directory in the terminal.
        </p>
        <Button
          onClick={openAdd}
          size="sm"
          className="font-mono bg-emerald-800 hover:bg-emerald-700 text-emerald-50"
        >
          <Plus className="h-4 w-4 mr-1" /> add bucket
        </Button>
      </div>

      <div className="rounded-lg border border-emerald-900/60 overflow-x-auto bg-black/50">
        <Table>
          <TableHeader>
            <TableRow className="border-emerald-900/60 hover:bg-transparent">
              <TableHead className="font-mono text-emerald-600">directory</TableHead>
              <TableHead className="font-mono text-emerald-600">bucket</TableHead>
              <TableHead className="font-mono text-emerald-600 hidden md:table-cell">objects</TableHead>
              <TableHead className="font-mono text-emerald-600 hidden md:table-cell">size</TableHead>
              <TableHead className="font-mono text-emerald-600">served</TableHead>
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
            ) : buckets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center font-mono text-emerald-700 py-8">
                  no buckets configured yet — add your first bucket
                </TableCell>
              </TableRow>
            ) : (
              buckets.map((b) => {
                const tr = testResults[b.id];
                return (
                  <TableRow key={b.id} className="border-emerald-900/40">
                    <TableCell className="font-mono text-sky-300">/{b.alias}/</TableCell>
                    <TableCell className="font-mono text-neutral-200">
                      {b.name}
                      {b.endpoint && (
                        <div className="text-[10px] text-emerald-800 truncate max-w-[200px]">{b.endpoint}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-neutral-400 hidden md:table-cell">
                      {b.files !== undefined ? (b.files < 0 ? "unreachable" : b.files.toLocaleString()) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-neutral-400 hidden md:table-cell">
                      {b.size !== undefined ? formatSize(b.size) : "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={b.served}
                        onCheckedChange={(v) => toggleServed(b, v)}
                        aria-label={`toggle serving ${b.alias}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => test(b)}
                          title="Test connection"
                          className="text-emerald-500 hover:text-emerald-300 hover:bg-emerald-950"
                        >
                          {testing === b.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <PlugZap className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(b)}
                          title="Edit"
                          className="text-emerald-500 hover:text-emerald-300 hover:bg-emerald-950"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleting(b)}
                          title="Delete"
                          className="text-red-500 hover:text-red-300 hover:bg-red-950/40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {tr && (
                        <div className="mt-1">
                          <Badge
                            variant="outline"
                            className={`font-mono text-[10px] ${
                              tr.ok
                                ? "border-emerald-700 text-emerald-400"
                                : "border-red-800 text-red-400"
                            }`}
                          >
                            {tr.ok ? "✓ " : "✗ "}
                            {tr.message.slice(0, 60)}
                          </Badge>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#04110a] border-emerald-900 text-neutral-100 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-emerald-400">
              {form.id ? "$ edit bucket" : "$ add bucket"}
            </DialogTitle>
            <DialogDescription className="font-mono text-emerald-700">
              Access keys come from your storage provider's dashboard — see the
              README (Storage setup) for a step-by-step guide.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="f-alias" className="font-mono text-emerald-500">
                directory name (shown in terminal)
              </Label>
              <Input
                id="f-alias"
                value={form.alias}
                onChange={(e) => setField("alias", e.target.value)}
                placeholder="movies"
                className="bg-black/60 border-emerald-900 font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-name" className="font-mono text-emerald-500">
                bucket name
              </Label>
              <Input
                id="f-name"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="my-media-movies"
                className="bg-black/60 border-emerald-900 font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-akid" className="font-mono text-emerald-500">
                access key id
              </Label>
              <Input
                id="f-akid"
                value={form.accessKeyId}
                onChange={(e) => setField("accessKeyId", e.target.value)}
                placeholder="access key id"
                className="bg-black/60 border-emerald-900 font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-secret" className="font-mono text-emerald-500">
                secret access key {form.id && <span className="text-emerald-800">(leave blank to keep current)</span>}
              </Label>
              <Input
                id="f-secret"
                type="password"
                value={form.secretAccessKey}
                onChange={(e) => setField("secretAccessKey", e.target.value)}
                placeholder={form.id ? "••••••••" : "secret access key"}
                className="bg-black/60 border-emerald-900 font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-endpoint" className="font-mono text-emerald-500">
                endpoint override <span className="text-emerald-800">(optional — default: STORAGE_ACCOUNT_ID env)</span>
              </Label>
              <Input
                id="f-endpoint"
                value={form.endpoint}
                onChange={(e) => setField("endpoint", e.target.value)}
                placeholder="https://<account-id>.<storage-endpoint>"
                className="bg-black/60 border-emerald-900 font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-desc" className="font-mono text-emerald-500">
                description <span className="text-emerald-800">(optional)</span>
              </Label>
              <Input
                id="f-desc"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Movies collection"
                className="bg-black/60 border-emerald-900 font-mono"
              />
            </div>
            {formError && (
              <p className="font-mono text-sm text-red-400" role="alert">
                ✗ {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="font-mono border-emerald-900 bg-transparent text-emerald-400 hover:bg-emerald-950 hover:text-emerald-200"
            >
              cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="font-mono bg-emerald-800 hover:bg-emerald-700 text-emerald-50"
            >
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {form.id ? "save changes" : "add bucket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="bg-[#04110a] border-red-900 text-neutral-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-red-400">
              $ rm -rf /{deleting?.alias}/ ?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-neutral-400">
              This removes the bucket from the archive config (and its one-time link
              history). Your files in remote storage are NOT deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono bg-transparent border-emerald-900 text-emerald-400 hover:bg-emerald-950">
              cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="font-mono bg-red-900 hover:bg-red-800 text-red-50"
            >
              delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
