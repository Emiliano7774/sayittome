"use client";

import { useEffect, useState } from "react";

import AdminShell from "@/components/admin/AdminShell";
import { auth } from "@/lib/firebase";

export default function AdminAnalyticsPage() {
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      const email = auth.currentUser?.email || "";
      const res = await fetch("/api/admin/dashboard", {
        headers: { "x-admin-email": email },
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.ok) setStats(json.stats);
    }

    load();
  }, []);

  const bars = [
    { key: "usersTotal", label: "Usuarios", color: "bg-violet-500" },
    { key: "usersOnline", label: "Online", color: "bg-green-500" },
    { key: "messagesLast24h", label: "Mensajes 24h", color: "bg-sky-400" },
    { key: "storiesActive", label: "Historias", color: "bg-pink-500" },
    { key: "reportsOpen", label: "Reportes", color: "bg-red-500" },
    { key: "growthToday", label: "Crecimiento", color: "bg-amber-400" },
  ];

  const max = Math.max(...bars.map((b) => Number(stats[b.key] || 0)), 1);

  return (
    <AdminShell title="Analytics">
      <div className="grid gap-6 max-w-4xl">
        {bars.map((bar) => {
          const value = Number(stats[bar.key] || 0);
          const width = Math.max(8, Math.round((value / max) * 100));

          return (
            <div key={bar.key}>
              <div className="flex justify-between font-black mb-2">
                <span>{bar.label}</span>
                <span className="text-white/50">{value}</span>
              </div>
              <div className="h-4 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full ${bar.color}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
