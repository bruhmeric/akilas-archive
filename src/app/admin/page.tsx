"use client";

import { useCallback, useEffect, useState } from "react";
import LoginForm from "@/components/admin/LoginForm";
import Dashboard from "@/components/admin/Dashboard";

type Me = {
  authenticated: boolean;
  username?: string;
  usingDefaultPassword?: boolean;
};

export default function AdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/me");
      if (res.ok) {
        setMe(await res.json());
      } else {
        setMe({ authenticated: false });
      }
    } catch {
      setMe({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setMe({ authenticated: false });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050a07] font-mono text-emerald-700 text-sm">
        establishing session…
      </div>
    );
  }

  if (!me?.authenticated) {
    return <LoginForm onSuccess={check} />;
  }

  return (
    <Dashboard
      username={me.username || "admin"}
      usingDefaultPassword={Boolean(me.usingDefaultPassword)}
      onLogout={logout}
    />
  );
}
