"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import AdminOverviewAnalytics from "@/components/admin/AdminOverviewAnalytics";
import AdminShell, { useAdminApi } from "@/components/admin/AdminShell";
import AdminGenderRatioPanel from "@/components/admin/AdminGenderRatioPanel";
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
        { label: "Crecimiento hoy", value: stats.growthToday, tone: "from-emerald-500/20" },
      ]
    : [];

  return (
    <AdminShell title="Resumen">
      <div className="mb-6 flex flex-wrap gap-3">
        {stats && stats.reportsOpen > 0 ? (
          <Link
            href="/admin/moderation?tab=reports"
            className="rounded-full border border-red-400/30 bg-red-500/15 px-4 py-2 text-sm font-black text-red-100"
          >
            {stats.reportsOpen} reportes pendientes →
          </Link>
        ) : null}
      </div>

      <AdminRegistrationsPanel adminEmail={admin.email} />
      <AdminGenderRatioPanel adminEmail={admin.email} />

      {loading ? (
        <p className="text-2xl font-black text-white/40">Cargando métricas...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <div
                key={card.label}
                className={`rounded-3xl border border-white/10 bg-gradient-to-br ${card.tone} to-black p-5 shadow-[0_20px_60px_rgba(0,0,0,.45)]`}
              >
                <p className="font-bold text-white/55">{card.label}</p>
                <p className="mt-2 text-4xl font-black tracking-tight">{card.value}</p>
              </div>
            ))}
          </div>
          {stats ? <AdminOverviewAnalytics stats={stats} /> : null}
        </>
      )}
    </AdminShell>
  );
}
