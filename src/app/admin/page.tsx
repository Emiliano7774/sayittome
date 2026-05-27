"use client";

import { useEffect, useState } from "react";

import AdminShell, { useAdminApi } from "@/components/admin/AdminShell";
import AdminRegistrationsPanel from "@/components/admin/AdminRegistrationsPanel";
import { auth } from "@/lib/firebase";

type DashboardStats = {
  usersTotal: number;
  usersOnline: number;
  anonymousOnline: number;
  storiesActive: number;
  chatsActive: number;
  messagesLast24h: number;
  reportsOpen: number;
  blurProfiles: number;
  storageUsedMb: number;
  growthToday: number;
};

export default function AdminDashboardPage() {
  const admin = useAdminApi();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const email = auth.currentUser?.email || admin.email;
        const res = await fetch("/api/admin/dashboard", {
          cache: "no-store",
          headers: { "x-admin-email": email },
        });
        const json = await res.json();
        if (json?.ok) setStats(json.stats);
      } finally {
        setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, 20_000);
    return () => window.clearInterval(timer);
  }, [admin.email]);

  const cards = stats
    ? [
        { label: "Usuarios totales", value: stats.usersTotal, tone: "from-violet-600/30" },
        { label: "Usuarios online", value: stats.usersOnline, tone: "from-green-500/25" },
        { label: "Anónimos online", value: stats.anonymousOnline, tone: "from-sky-500/25" },
        { label: "Historias activas", value: stats.storiesActive, tone: "from-pink-500/25" },
        { label: "Chats activos", value: stats.chatsActive, tone: "from-amber-500/20" },
        { label: "Mensajes 24h", value: stats.messagesLast24h, tone: "from-white/10" },
        { label: "Reportes abiertos", value: stats.reportsOpen, tone: "from-red-500/25" },
        { label: "Perfiles con blur", value: stats.blurProfiles, tone: "from-fuchsia-500/20" },
        { label: "Storage estimado (MB)", value: stats.storageUsedMb, tone: "from-indigo-500/20" },
        { label: "Crecimiento hoy", value: stats.growthToday, tone: "from-emerald-500/20" },
      ]
    : [];

  return (
    <AdminShell title="Dashboard">
      <AdminRegistrationsPanel adminEmail={admin.email} />
      {loading ? (
        <p className="text-white/40 font-black text-2xl">Cargando métricas...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {cards.map((card) => (
            <div
              key={card.label}
              className={`rounded-3xl border border-white/10 bg-gradient-to-br ${card.tone} to-black p-6 shadow-[0_20px_60px_rgba(0,0,0,.45)] animate-pulse [animation-duration:4s]`}
            >
              <p className="text-white/55 font-bold">{card.label}</p>
              <p className="mt-3 text-5xl font-black tracking-tight">{card.value}</p>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
