"use client";

import { useState } from "react";

import ClassicModerationFeed from "@/components/admin/classic/ClassicModerationFeed";
import AdminChatReviewView from "@/components/admin/review/AdminChatReviewView";
import { useClassicModerationFeed } from "@/hooks/useClassicModerationFeed";
import { usePhoneShell } from "@/hooks/usePhoneShell";
import { formatActivityTime } from "@/lib/moderation/classicFeed";
import type { ModerationUserFeedEntry } from "@/lib/moderation/types";

export default function SpectatorModerationHub() {
  const phoneShell = usePhoneShell();
  const [selectedEntry, setSelectedEntry] = useState<ModerationUserFeedEntry | null>(
    null,
  );

  const username = selectedEntry?.username || "";

  if (phoneShell && username) {
    return (
      <AdminChatReviewView
        username={username}
        preferredChatId={selectedEntry?.lastChatId}
        showBack
        onBack={() => setSelectedEntry(null)}
      />
    );
  }

  return (
    <div
      className={[
        "grid min-h-0 gap-4 md:gap-5",
        username ? "xl:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.1fr)]" : "",
      ].join(" ")}
    >
      <div className="min-h-0 rounded-2xl border border-white/10 bg-[#0a0a0a]/80 p-3 md:p-4">
        <div className="mb-4 border-b border-white/10 pb-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
            1 · Elegir persona
          </p>
          <p className="mt-2 text-sm font-bold text-white/55">
            Ordenadas por última actividad. Tocá un perfil para revisar sus chats.
          </p>
        </div>
        <PersonFeed
          selectedUsername={username}
          onSelect={setSelectedEntry}
        />
      </div>

      {username ? (
        <div className="min-h-0">
          <div className="mb-3 border-b border-white/10 pb-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
              2 · {username}
            </p>
            <p className="mt-2 text-sm font-bold text-white/55">
              Historial arriba, conversación abajo — como la vería un tercero.
            </p>
          </div>
          <AdminChatReviewView
            username={username}
            preferredChatId={selectedEntry?.lastChatId}
          />
        </div>
      ) : (
        <div className="hidden min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-[#0a0a0a]/50 px-6 text-center xl:flex">
          <p className="max-w-sm text-sm font-bold text-white/40">
            Seleccioná una persona del listado para ver todo su historial de conversaciones.
          </p>
        </div>
      )}
    </div>
  );
}

function PersonFeed({
  selectedUsername,
  onSelect,
}: {
  selectedUsername: string;
  onSelect: (entry: ModerationUserFeedEntry) => void;
}) {
  const { feed, loading } = useClassicModerationFeed();

  if (loading) {
    return <p className="text-lg font-bold text-white/35">Cargando actividad...</p>;
  }

  if (feed.length === 0) {
    return <p className="text-lg font-bold text-white/35">Sin actividad de conversaciones.</p>;
  }

  return (
    <div className="max-h-[min(70vh,640px)] space-y-2 overflow-y-auto overscroll-contain md:space-y-3">
      {feed.map((entry, index) => {
        const active =
          selectedUsername.toLowerCase() === entry.username.toLowerCase();

        return (
          <button
            key={entry.username}
            type="button"
            onClick={() => onSelect(entry)}
            className={[
              "w-full rounded-xl border px-4 py-3.5 text-left transition md:px-5 md:py-4",
              active
                ? "border-violet-400/35 bg-violet-500/10"
                : entry.unseen
                  ? "border-amber-400/35 bg-[#171717]"
                  : "border-white/10 bg-[#111111] hover:border-white/18",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{entry.username}</p>
                <p className="mt-1 line-clamp-2 text-sm font-bold text-white/50">
                  {entry.lastMessage || "Sin mensajes"}
                </p>
                <p className="mt-1.5 text-xs font-bold text-white/35">
                  {entry.chatCount} chat{entry.chatCount === 1 ? "" : "s"} ·{" "}
                  {formatActivityTime(entry.lastActivityMs)}
                </p>
              </div>
              {index === 0 ? (
                <span className="shrink-0 text-[10px] font-bold uppercase text-emerald-300/80">
                  Ahora
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
