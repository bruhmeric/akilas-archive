"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import StatsCards from "./StatsCards";
import BucketManager from "./BucketManager";
import LinkLog from "./LinkLog";
import SettingsForm from "./SettingsForm";
import { TriangleAlert, LogOut, ExternalLink } from "lucide-react";

export default function Dashboard({ username, usingDefaultPassword, onLogout }: {
  username: string;
  usingDefaultPassword: boolean;
  onLogout: () => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-screen bg-[#050a07] text-neutral-100">
      {/* header */}
      <header className="sticky top-0 z-10 border-b border-emerald-900/60 bg-black/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="font-mono text-sm sm:text-base min-w-0">
            <span className="text-emerald-400">root@akilas-archive</span>
            <span className="text-neutral-500">:</span>
            <span className="text-cyan-300">~/admin</span>
            <span className="text-emerald-400">#</span>
            <span className="text-emerald-800 ml-2 truncate hidden sm:inline">
              logged in as {username}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" target="_blank" rel="noreferrer">
              <Button
                variant="outline"
                size="sm"
                className="font-mono border-emerald-900 bg-transparent text-emerald-400 hover:bg-emerald-950 hover:text-emerald-200"
              >
                terminal <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </Button>
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className="font-mono border-emerald-900 bg-transparent text-emerald-400 hover:bg-emerald-950 hover:text-emerald-200"
            >
              <LogOut className="h-3.5 w-3.5 mr-1" /> logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {usingDefaultPassword && (
          <Alert className="border-amber-800 bg-amber-950/40 text-amber-200">
            <TriangleAlert className="text-amber-400" />
            <AlertTitle className="font-mono">Default password in use</AlertTitle>
            <AlertDescription className="font-mono text-amber-300/80 text-xs">
              Set <code className="text-amber-200">ADMIN_USERNAME</code> and{" "}
              <code className="text-amber-200">ADMIN_PASSWORD</code> environment variables
              (then restart the container) before exposing this to the internet.
            </AlertDescription>
          </Alert>
        )}

        <StatsCards refreshKey={refreshKey} />

        <Tabs defaultValue="buckets" className="space-y-4">
          <TabsList className="bg-black/60 border border-emerald-900/60 font-mono">
            <TabsTrigger value="buckets" className="font-mono data-[state=active]:bg-emerald-950 data-[state=active]:text-emerald-300">
              buckets
            </TabsTrigger>
            <TabsTrigger value="links" className="font-mono data-[state=active]:bg-emerald-950 data-[state=active]:text-emerald-300">
              one-time links
            </TabsTrigger>
            <TabsTrigger value="settings" className="font-mono data-[state=active]:bg-emerald-950 data-[state=active]:text-emerald-300">
              settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="buckets">
            <BucketManager refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />
          </TabsContent>
          <TabsContent value="links">
            <LinkLog refreshKey={refreshKey} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsForm />
          </TabsContent>
        </Tabs>

        <footer className="pt-4 pb-8 text-center font-mono text-[11px] text-emerald-900">
          <Badge variant="outline" className="border-emerald-900 text-emerald-800 font-mono">
            downloads stream straight from storage — this server only serves metadata
          </Badge>
        </footer>
      </main>
    </div>
  );
}
