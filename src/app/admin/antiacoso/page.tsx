"use client";

import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { useEffect, useState } from "react";

import AdminShell, { useAdminApi } from "@/components/admin/AdminShell";
import { db } from "@/lib/firebase";
import { isAbuseBlockActive, type AbuseBlockRecord } from "@/lib/abuse/anonAbuseBlocks";

export default function AdminAntiacosoPage() {
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

  return (
    <AdminShell title="Antiacoso global">
      <div className="space-y-4">
        {blocks.map((block) => {
          const active = isAbuseBlockActive(block);

          return (
            <div
              key={block.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div>
                <p className="font-black text-lg">{block.blockedFingerprint || block.id}</p>
                <p className="text-white/50 font-bold text-sm mt-1">
                  Receptor: {block.receptorUid} · Chat: {block.chatId || "-"}
                </p>
                <p className="text-white/50 font-bold text-sm">
                  Motivo: {block.motivo || "-"} · Por: {block.blockedBy || "-"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={[
                    "rounded-full px-4 py-2 text-xs font-black",
                    active ? "bg-green-500/20 text-green-300" : "bg-white/10 text-white/50",
                  ].join(" ")}
                >
                  {active ? "activo" : "expirado"}
                </span>

                <button
                  type="button"
                  onClick={() => admin.postAction({ action: "extend_abuse_block", blockId: block.id, extraMinutes: 60 })}
                  className="rounded-xl bg-violet-500/20 px-4 py-2 font-black text-sm"
                >
                  +60 min
                </button>

                <button
                  type="button"
                  onClick={() => admin.postAction({ action: "remove_abuse_block", blockId: block.id })}
                  className="rounded-xl bg-red-500/20 px-4 py-2 font-black text-sm"
                >
                  Remover
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
