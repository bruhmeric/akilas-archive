"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Settings = {
  presignExpirySeconds: number;
  linkExpiryHours: number;
  motd: string;
  searchScanLimit: number;
};

export default function SettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Save failed", description: data.error, variant: "destructive" });
        return;
      }
      setSettings(data.settings);
      toast({ title: "Settings saved", description: "Changes apply immediately." });
    } catch {
      toast({ title: "Connection failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex items-center gap-2 font-mono text-emerald-700 py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> loading settings…
      </div>
    );
  }

  const set = (k: keyof Settings, v: string | number) =>
    setSettings((s) => (s ? { ...s, [k]: v } : s));

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="grid gap-2">
        <Label htmlFor="s-presign" className="font-mono text-emerald-500">
          presigned URL lifetime — {settings.presignExpirySeconds}s
        </Label>
        <p className="font-mono text-[11px] text-emerald-800">
          How long the real download URL stays valid after a one-time link is opened.
          Shorter = stricter (30s is plenty for a direct click).
        </p>
        <Input
          id="s-presign"
          type="number"
          min={10}
          max={3600}
          value={settings.presignExpirySeconds}
          onChange={(e) => set("presignExpirySeconds", Number(e.target.value))}
          className="bg-black/60 border-emerald-900 font-mono text-neutral-100"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="s-link" className="font-mono text-emerald-500">
          one-time link validity — {settings.linkExpiryHours}h
        </Label>
        <p className="font-mono text-[11px] text-emerald-800">
          How long an unused one-time link remains redeemable.
        </p>
        <Input
          id="s-link"
          type="number"
          min={0.1}
          max={720}
          step={0.5}
          value={settings.linkExpiryHours}
          onChange={(e) => set("linkExpiryHours", Number(e.target.value))}
          className="bg-black/60 border-emerald-900 font-mono text-neutral-100"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="s-scan" className="font-mono text-emerald-500">
          search scan limit — {settings.searchScanLimit.toLocaleString()} objects/bucket
        </Label>
        <p className="font-mono text-[11px] text-emerald-800">
          Upper bound on how many object keys `find`, `tree` and stats scan per bucket.
        </p>
        <Input
          id="s-scan"
          type="number"
          min={1000}
          max={100000}
          step={1000}
          value={settings.searchScanLimit}
          onChange={(e) => set("searchScanLimit", Number(e.target.value))}
          className="bg-black/60 border-emerald-900 font-mono text-neutral-100"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="s-motd" className="font-mono text-emerald-500">
          message of the day (shown on terminal boot)
        </Label>
        <Textarea
          id="s-motd"
          rows={2}
          value={settings.motd}
          onChange={(e) => set("motd", e.target.value)}
          className="bg-black/60 border-emerald-900 font-mono text-neutral-100"
        />
      </div>

      <Button
        onClick={save}
        disabled={saving}
        className="font-mono bg-emerald-800 hover:bg-emerald-700 text-emerald-50"
      >
        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
        save settings
      </Button>
    </div>
  );
}
