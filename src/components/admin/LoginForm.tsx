"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Access denied");
        return;
      }
      onSuccess();
    } catch {
      setError("Connection failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050a07] px-4">
      <Card className="w-full max-w-sm bg-black/60 border-emerald-900/70 text-neutral-100 shadow-[0_0_40px_rgba(16,185,129,0.08)]">
        <CardHeader>
          <CardTitle className="font-mono text-emerald-400">
            root@akilas-archive:~# auth
          </CardTitle>
          <CardDescription className="font-mono text-emerald-700">
            Administrator access — Akila&apos;s Archive
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="font-mono text-emerald-500">
                username
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="bg-black/60 border-emerald-900 font-mono focus-visible:ring-emerald-700"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="font-mono text-emerald-500">
                password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="bg-black/60 border-emerald-900 font-mono focus-visible:ring-emerald-700"
                required
              />
            </div>
            {error && (
              <p className="font-mono text-sm text-red-400" role="alert">
                ✗ {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={busy}
              className="w-full font-mono bg-emerald-800 hover:bg-emerald-700 text-emerald-50"
            >
              {busy ? "authenticating…" : "$ sudo login"}
            </Button>
            <p className="font-mono text-[11px] text-emerald-800 text-center">
              <a href="/" className="underline decoration-dotted hover:text-emerald-500">
                ← back to terminal
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
