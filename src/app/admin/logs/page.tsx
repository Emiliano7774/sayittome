"use client";

import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";

import AdminShell from "@/components/admin/AdminShell";
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

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<AdminLogRow[]>([]);

  useEffect(() => {
    const q = query(collection(db, "admin_logs"), orderBy("timestamp", "desc"), limit(200));

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
    <AdminShell title="Logs admin">
      <div className="space-y-3">
        {logs.map((log) => (
          <div key={log.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="font-black">{log.accion || log.action}</p>
            <p className="text-white/50 font-bold text-sm mt-1">
              {log.adminEmail} → {log.targetUid || "-"} · {log.timestamp || "ahora"}
            </p>
            {log.metadata ? (
              <pre className="mt-2 text-xs text-white/35 overflow-x-auto">{log.metadata}</pre>
            ) : null}
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
