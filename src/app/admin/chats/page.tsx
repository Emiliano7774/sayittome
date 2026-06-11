"use client";

import { useState } from "react";

import AdminShell from "@/components/admin/AdminShell";
import ModernAdminChatsPanel from "@/components/admin/ModernAdminChatsPanel";
import SpectatorModerationHub from "@/components/admin/spectator/SpectatorModerationHub";

type PanelMode = "review" | "modern";

export default function AdminChatsPage() {
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

      {panelMode === "modern" ? <ModernAdminChatsPanel /> : <SpectatorModerationHub />}
    </AdminShell>
  );
}
