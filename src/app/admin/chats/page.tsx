"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import AdminShell from "@/components/admin/AdminShell";
import ModernAdminChatsPanel from "@/components/admin/ModernAdminChatsPanel";
import { useClassicModerationFeed } from "@/hooks/useClassicModerationFeed";
import { formatActivityTime } from "@/lib/moderation/classicFeed";

type PanelMode = "review" | "modern";

export default function AdminChatsPage() {
  const router = useRouter();
  const { feed, loading } = useClassicModerationFeed();
  const [panelMode, setPanelMode] = useState<PanelMode>("review");

  return (
    <AdminShell title="Revisar conversaciones">
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-white/10 pb-3 md:mb-6 md:gap-3 md:pb-4">
        <button
          type="button"
          onClick={() => setPanelMode("review")}
          className={[
            "rounded-full border px-4 py-2 text-sm font-bold transition",
            panelMode === "review"
              ? "border-violet-400/35 bg-violet-500/12 text-violet-100"
              : "border-white/10 bg-[#111] text-white/45",
          ].join(" ")}
        >
          Revisar chats
        </button>
        <button
          type="button"
          onClick={() => setPanelMode("modern")}
          className={[
            "rounded-full border px-4 py-2 text-sm font-bold transition",
            panelMode === "modern"
              ? "border-white/20 bg-[#1a1a1a] text-white/75"
              : "border-white/10 bg-[#111] text-white/45",
          ].join(" ")}
        >
          Vista estable
        </button>
      </div>

      {panelMode === "modern" ? (
        <ModernAdminChatsPanel />
      ) : loading ? (
        <p className="text-lg font-bold text-white/35">Cargando perfiles...</p>
      ) : feed.length === 0 ? (
        <p className="text-lg font-bold text-white/35">Sin actividad.</p>
      ) : (
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-bold text-white/50">
            Tocá un perfil para abrir su historial completo y leer cada chat como en la app.
          </p>
          <div className="space-y-2">
            {feed.map((entry, index) => (
              <button
                key={entry.username}
                type="button"
                onClick={() =>
                  router.push(`/admin/chats/${encodeURIComponent(entry.username)}`)
                }
                className={[
                  "w-full rounded-xl border px-4 py-4 text-left transition hover:border-violet-400/30",
                  entry.unseen
                    ? "border-amber-400/30 bg-[#141414]"
                    : "border-white/10 bg-[#111]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-bold">{entry.username}</p>
                    <p className="mt-1 line-clamp-1 text-sm font-bold text-white/50">
                      {entry.lastMessage || "Sin mensajes"}
                    </p>
                    <p className="mt-1 text-xs font-bold text-white/35">
                      {entry.chatCount} chats · {formatActivityTime(entry.lastActivityMs)}
                    </p>
                  </div>
                  {index === 0 ? (
                    <span className="shrink-0 text-xs font-bold text-emerald-300">Ahora</span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
