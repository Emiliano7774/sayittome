"use client";

import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";

import { useAdminApi } from "@/components/admin/AdminShell";
import { db } from "@/lib/firebase";
import { isAbuseBlockActive, type AbuseBlockRecord } from "@/lib/abuse/anonAbuseBlocks";

export default function AdminAntiacosoPanel() {
  const admin = useAdminApi();
  const [blocks, setBlocks] = useState<AbuseBlockRecord[]>([]);

  useEffect(() => {
    const q = query(collection(db, "anon_abuse_blocks"), orderBy("createdAt", "desc"), limit(200));

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((docu) => ({
        id: docu.id,
        ...(docu.data() as Omit<AbuseBlockRecord, "id">),
      }));
      setBlocks(rows);
    });

    return () => unsub();
  }, []);

  if (blocks.length === 0) {
    return <p className="text-white/40 font-bold">No hay bloqueos antiacoso recientes.</p>;
  }

  return (
    <div className="space-y-4">
      {blocks.map((block) => {
        const active = isAbuseBlockActive(block);

        return (
          <div
            key={block.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <div>
              <p className="text-lg font-black">{block.blockedFingerprint || block.id}</p>
              <p className="mt-1 text-sm font-bold text-white/50">
                Receptor: {block.receptorUid} · Chat: {block.chatId || "-"}
              </p>
              <p className="text-sm font-bold text-white/50">
                Motivo: {block.motivo || "-"} · Por: {block.blockedBy || "-"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={[
                  "rounded-full px-3 py-1 text-xs font-black",
                  active ? "bg-red-500/20 text-red-200" : "bg-white/10 text-white/45",
                ].join(" ")}
              >
                {active ? "Activo" : "Vencido"}
              </span>
              <button
                type="button"
                onClick={() => admin.postAction({ action: "remove_abuse_block", blockId: block.id })}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black"
              >
                Quitar
              </button>
              <button
                type="button"
                onClick={() =>
                  admin.postAction({ action: "extend_abuse_block", blockId: block.id, extraMinutes: 60 })
                }
                className="rounded-xl bg-violet-500/20 px-4 py-2 text-sm font-black"
              >
                +60 min
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
