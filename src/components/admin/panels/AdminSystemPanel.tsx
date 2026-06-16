"use client";

import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";

import { ADMIN_EMAIL } from "@/lib/admin/isAdmin";
import { db } from "@/lib/firebase";

type AdminLogRow = {
  id: string;
  timestamp?: string;
  adminEmail?: string;
  targetUid?: string;
  accion?: string;
  action?: string;
  metadata?: string;
};

export default function AdminSystemPanel() {
  const [logs, setLogs] = useState<AdminLogRow[]>([]);

  useEffect(() => {
    const q = query(collection(db, "admin_logs"), orderBy("timestamp", "desc"), limit(120));

    const unsub = onSnapshot(q, (snap) => {
      setLogs(
        snap.docs.map((row) => ({
          id: row.id,
          ...(row.data() as Omit<AdminLogRow, "id">),
        })),
      );
    });

    return () => unsub();
  }, []);

  return (
    <div className="space-y-8">
      <section className="max-w-2xl space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-xl font-black">Referencia rápida</p>
        <p className="font-bold text-white/55">Email autorizado: {ADMIN_EMAIL}</p>
        <p className="font-bold text-white/55">Presencia online: ventana de 15 minutos.</p>
        <p className="font-bold text-white/55">Antiacoso default: 30 minutos por fingerprint.</p>
        <p className="font-bold text-white/55">Link verificado: /u/username?verified=1</p>
      </section>

      <section>
        <p className="mb-4 text-lg font-black">Logs recientes</p>
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="font-black">{log.accion || log.action}</p>
              <p className="mt-1 text-sm font-bold text-white/50">
                {log.adminEmail} → {log.targetUid || "-"} · {log.timestamp || "ahora"}
              </p>
              {log.metadata ? (
                <pre className="mt-2 overflow-x-auto text-xs text-white/35">{log.metadata}</pre>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
