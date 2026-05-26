"use client";

import { useRouter } from "next/navigation";

import { formatActivityTime } from "@/lib/moderation/classicFeed";
import { useClassicModerationFeed } from "@/hooks/useClassicModerationFeed";

export default function ClassicModerationFeed() {
  const router = useRouter();
  const { feed, loading } = useClassicModerationFeed();

  return (
    <div className="max-w-4xl">
      <div className="mb-6 border-b border-white/10 pb-4">
        <p className="text-sm font-bold text-white/45 uppercase tracking-[0.18em]">
          Feed vivo Classic
        </p>
        <p className="mt-2 text-base font-bold text-white/65">
          Ordenado por última interacción de mensajes. Sin orden alfabético.
        </p>
      </div>

      {loading ? (
        <p className="text-2xl font-bold text-white/35">Cargando actividad...</p>
      ) : feed.length === 0 ? (
        <p className="text-2xl font-bold text-white/35">Sin actividad de conversaciones.</p>
      ) : (
        <div className="space-y-3">
          {feed.map((entry, index) => (
            <button
              key={entry.username}
              type="button"
              onClick={() =>
                router.push(`/admin/chats/${encodeURIComponent(entry.username)}`)
              }
              style={{ transition: "transform 180ms ease, box-shadow 180ms ease" }}
              className={[
                "w-full text-left border px-5 py-4 active:scale-[0.995]",
                entry.unseen
                  ? "border-amber-400/35 bg-[#171717]"
                  : "border-white/10 bg-[#111111]",
                index === 0 ? "shadow-[0_0_0_1px_rgba(255,255,255,0.04)]" : "",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="truncate text-2xl font-bold">{entry.username}</p>
                    {entry.unseen ? (
                      <span className="shrink-0 border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-200">
                        No visto
                      </span>
                    ) : (
                      <span className="shrink-0 border border-white/15 bg-[#222] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white/45">
                        Visto
                      </span>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-1 text-base font-bold text-white/50">
                    {entry.lastMessage || "Sin mensajes"}
                  </p>
                  <p className="mt-2 text-sm font-bold text-white/35">
                    {entry.chatCount} conversación{entry.chatCount === 1 ? "" : "es"} ·{" "}
                    {formatActivityTime(entry.lastActivityMs)}
                  </p>
                </div>

                <span className="shrink-0 text-sm font-bold text-white/35">
                  #{index + 1}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

    </div>
  );
}
