"use client";

import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";

import { useAdminApi } from "@/components/admin/AdminShell";
import { ADMIN_EMAIL } from "@/lib/admin/isAdmin";
import { buildUndoPayload, canUndoAdminAction } from "@/lib/admin/adminActionUndo";
import { useT } from "@/contexts/LocaleContext";
import { db } from "@/lib/firebase";

type AdminLogRow = {
  id: string;
  timestamp?: string;
  adminEmail?: string;
  targetUid?: string;
  targetId?: string;
  accion?: string;
  action?: string;
  metadata?: string;
};

export default function AdminSystemPanel() {
  const t = useT();
  const admin = useAdminApi();
  const [logs, setLogs] = useState<AdminLogRow[]>([]);
  const [busyId, setBusyId] = useState("");

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

  async function revertLog(log: AdminLogRow) {
    const originalAction = String(log.accion || log.action || "");
    if (!canUndoAdminAction(originalAction) || busyId) return;

    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(log.metadata || "{}") as Record<string, unknown>;
    } catch {
      metadata = {};
    }

    const payload = buildUndoPayload(originalAction, {
      ...metadata,
      uid: log.targetUid || metadata.uid,
      chatId: metadata.chatId || log.targetId,
      storyId: metadata.storyId || log.targetId,
    });

    if (!payload) return;

    setBusyId(log.id);
    try {
      const json = await admin.postAction(payload);
      if (!json?.ok) alert(t("admin_undo_fail"));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-8">
      <section className="max-w-2xl space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-xl font-black">Referencia rápida</p>
        <p className="font-bold text-white/55">Email autorizado: {ADMIN_EMAIL}</p>
        <p className="font-bold text-white/55">Presencia online: ventana de 15 minutos.</p>
        <p className="font-bold text-white/55">Antiacoso default: 30 minutos por fingerprint.</p>
        <p className="font-bold text-white/55">Link verificado: /u/username?verified=1</p>
        <p className="font-bold text-white/55">
          Autoría histórica: <a className="underline" href="/admin/authorship">/admin/authorship</a>
        </p>
      </section>

      <section>
        <p className="mb-4 text-lg font-black">Logs recientes</p>
        <div className="space-y-3">
          {logs.map((log) => {
            const action = log.accion || log.action || "";
            const canUndo = canUndoAdminAction(action);

            return (
              <div key={log.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{action}</p>
                    <p className="mt-1 text-sm font-bold text-white/50">
                      {log.adminEmail} → {log.targetUid || "-"} · {log.timestamp || "ahora"}
                    </p>
                  </div>
                  {canUndo ? (
                    <button
                      type="button"
                      disabled={busyId === log.id}
                      onClick={() => void revertLog(log)}
                      className="rounded-xl border border-sky-400/30 bg-sky-500/15 px-4 py-2 text-sm font-black text-sky-100 disabled:opacity-50"
                    >
                      {t("admin_undo_revert")}
                    </button>
                  ) : null}
                </div>
                {log.metadata ? (
                  <pre className="mt-2 overflow-x-auto text-xs text-white/35">{log.metadata}</pre>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
