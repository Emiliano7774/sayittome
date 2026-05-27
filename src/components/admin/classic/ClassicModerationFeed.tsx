"use client";

import { useRouter } from "next/navigation";

import { formatActivityTime } from "@/lib/moderation/classicFeed";
import { useClassicModerationFeed } from "@/hooks/useClassicModerationFeed";
import { usePhoneShell } from "@/hooks/usePhoneShell";

export default function ClassicModerationFeed() {
  const router = useRouter();
  const { feed, loading } = useClassicModerationFeed();
  const phoneShell = usePhoneShell();

  return (
    <div className={phoneShell ? "max-w-full" : "max-w-4xl"}>
      <div className="mb-4 border-b border-white/10 pb-3 md:mb-6 md:pb-4">
        <p className="text-xs font-bold text-white/45 uppercase tracking-[0.18em] md:text-sm">
          Feed vivo Classic
        </p>
        <p className="mt-2 text-sm font-bold text-white/65 md:text-base">
          Ordenado por última interacción de mensajes. Sin orden alfabético.
        </p>
      </div>

      {loading ? (
        <p className="text-lg font-bold text-white/35 md:text-2xl">Cargando actividad...</p>
      ) : feed.length === 0 ? (
        <p className="text-lg font-bold text-white/35 md:text-2xl">Sin actividad de conversaciones.</p>
      ) : (
        <div className="space-y-2 md:space-y-3">
          {feed.map((entry, index) => (
            <button
              key={entry.username}
              type="button"
              onClick={() =>
                router.push(`/admin/chats/${encodeURIComponent(entry.username)}`)
              }
              style={{ transition: "transform 180ms ease, box-shadow 180ms ease" }}
              className={[
                "w-full text-left border px-4 py-3.5 active:scale-[0.995] md:px-5 md:py-4",
                entry.unseen
                  ? "border-amber-400/35 bg-[#171717]"
                  : "border-white/10 bg-[#111111]",
                index === 0 ? "shadow-[0_0_0_1px_rgba(255,255,255,0.04)]" : "",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3 md:gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 md:gap-3">
                    <p className="truncate text-lg font-bold md:text-2xl">{entry.username}</p>
                    {entry.unseen ? (
                      <span className="shrink-0 border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200 md:text-[11px]">
                        No visto
                      </span>
                    ) : (
                      <span className="shrink-0 border border-white/15 bg-[#222] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/45 md:text-[11px]">
                        Visto
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm font-bold text-white/50 md:mt-2 md:line-clamp-1 md:text-base">
                    {entry.lastMessage || "Sin mensajes"}
                  </p>
                  <p className="mt-1.5 text-xs font-bold text-white/35 md:mt-2 md:text-sm">
                    {entry.chatCount} conversación{entry.chatCount === 1 ? "" : "es"} ·{" "}
                    {formatActivityTime(entry.lastActivityMs)}
                  </p>
                </div>

                <span className="shrink-0 text-xs font-bold text-white/35 md:text-sm">
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
