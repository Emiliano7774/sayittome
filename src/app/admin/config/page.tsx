"use client";

import AdminShell from "@/components/admin/AdminShell";
import { ADMIN_EMAIL } from "@/lib/admin/isAdmin";

export default function AdminConfigPage() {
  return (
    <AdminShell title="Config">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 max-w-2xl space-y-4">
        <p className="font-black text-xl">Seguridad admin</p>
        <p className="text-white/55 font-bold">Email autorizado: {ADMIN_EMAIL}</p>
        <p className="text-white/55 font-bold">
          Ventana presencia online: 15 minutos (heartbeat real).
        </p>
        <p className="text-white/55 font-bold">
          Bloqueo antiacoso default: 30 minutos por fingerprint + visitorId.
        </p>
        <p className="text-white/55 font-bold">
          Link verificado: /u/username?verified=1
        </p>
      </div>
    </AdminShell>
  );
}
