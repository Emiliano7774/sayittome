"use client";

import { useState } from "react";

import AdminChatReviewView from "@/components/admin/review/AdminChatReviewView";
import AdminAnonMatchChatsPanel from "@/components/admin/spectator/AdminAnonMatchChatsPanel";
import SpectatorLiveFeed from "@/components/admin/spectator/SpectatorLiveFeed";
import { useClassicModerationFeed } from "@/hooks/useClassicModerationFeed";
import { usePhoneShell } from "@/hooks/usePhoneShell";
import type { ModerationUserFeedEntry } from "@/lib/moderation/types";

export default function SpectatorModerationHub() {
  const phoneShell = usePhoneShell();
  // recentLiveLimit is only for the live listener window; authoritative snapshot is full.
  const recentLiveLimit = phoneShell ? 80 : 250;
  const { feed, loading, errorText, authoritativeTotal, refreshAuthoritative } =
    useClassicModerationFeed(recentLiveLimit);
  const [selectedEntry, setSelectedEntry] = useState<ModerationUserFeedEntry | null>(null);
  const [scope, setScope] = useState<"profiles" | "all_anon" | "anon_match">("profiles");
  const username = selectedEntry?.username || "";

  const scopeBar = (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setScope("profiles")}
        className={scope === "profiles" ? "rounded-full bg-violet-600 px-4 py-2 text-sm font-black" : "rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/55"}
      >
        Chats de perfiles
      </button>
      <button
        type="button"
        onClick={() => setScope("all_anon")}
        className={scope === "all_anon" ? "rounded-full bg-violet-600 px-4 py-2 text-sm font-black" : "rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/55"}
      >
        Revisar chats anónimos
      </button>
      <button
        type="button"
        onClick={() => setScope("anon_match")}
        className={scope === "anon_match" ? "rounded-full bg-violet-600 px-4 py-2 text-sm font-black" : "rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/55"}
      >
        No encontraste a nadie interesante
      </button>
    </div>
  );

  if (scope === "all_anon" || scope === "anon_match") {
    return (
      <div className="space-y-4">
        {scopeBar}
        <AdminAnonMatchChatsPanel mode={scope === "all_anon" ? "all" : "match"} />
      </div>
    );
  }

  if (phoneShell && username) {
    return (
      <div className="space-y-4">
        {scopeBar}
        <AdminChatReviewView
          username={username}
          preferredChatId={selectedEntry?.lastChatId}
          showBack
          onBack={() => setSelectedEntry(null)}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {scopeBar}
      <div
        className={[
          "grid min-h-0 gap-4 md:gap-5",
          username ? "xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]" : "",
        ].join(" ")}
      >
        <div className="min-h-0 rounded-2xl border border-white/10 bg-[#0a0a0a]/80 p-3 md:p-4">
          {errorText ? (
            <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-sm font-bold text-rose-200">
              <p>{errorText}</p>
              <button
                type="button"
                className="mt-2 rounded-full border border-rose-300/40 px-3 py-1 text-xs font-black"
                onClick={() => void refreshAuthoritative()}
              >
                Reintentar catálogo completo
              </button>
            </div>
          ) : null}
          {!loading && authoritativeTotal > 0 ? (
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">
              Catálogo admin · {authoritativeTotal} chats escaneados
            </p>
          ) : null}
          <SpectatorLiveFeed
            feed={feed}
            loading={loading}
            selectedUsername={username}
            onSelect={setSelectedEntry}
          />
        </div>

        {username ? (
          <div className="min-h-0">
            <div className="mb-3 border-b border-white/10 pb-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                Revisando · {username}
              </p>
              <p className="mt-2 text-sm font-bold text-white/55">
                Izquierda = visitante anónimo · Derecha = dueño del perfil ({username})
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
              Seleccioná un perfil del listado para ver quién le escribió y leer el chat completo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
