"use client";

import { useState } from "react";

import AdminShell from "@/components/admin/AdminShell";
import ClassicModerationFeed from "@/components/admin/classic/ClassicModerationFeed";
import ModernAdminChatsPanel from "@/components/admin/ModernAdminChatsPanel";
import { useUxMode } from "@/contexts/UxModeContext";

type PanelMode = "classic" | "modern";

export default function AdminChatsPage() {
  const { uxMode } = useUxMode();
  const [panelMode, setPanelMode] = useState<PanelMode>(
    uxMode === "classic" ? "classic" : "modern",
  );

  return (
    <AdminShell title="Revisar conversaciones">
      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-white/10 pb-4">
        <button
          type="button"
          onClick={() => setPanelMode("classic")}
          className={[
            "border px-4 py-2 text-sm font-bold transition",
            panelMode === "classic"
              ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
              : "border-white/10 bg-[#111] text-white/45",
          ].join(" ")}
        >
          Feed vivo Classic
        </button>
        <button
          type="button"
          onClick={() => setPanelMode("modern")}
          className={[
            "border px-4 py-2 text-sm font-bold transition",
            panelMode === "modern"
              ? "border-violet-400/40 bg-violet-500/15 text-violet-100"
              : "border-white/10 bg-[#111] text-white/45",
          ].join(" ")}
        >
          Vista estable Modern
        </button>
        <p className="text-sm font-bold text-white/35">
          Classic = tiempo real por actividad · Modern = lista estable
        </p>
      </div>

      {panelMode === "classic" ? <ClassicModerationFeed /> : <ModernAdminChatsPanel />}
    </AdminShell>
  );
}
