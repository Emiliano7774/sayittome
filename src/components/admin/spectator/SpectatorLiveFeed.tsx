"use client";

import { useEffect, useRef } from "react";

import ChatInboxAvatar from "@/components/chats/ChatInboxAvatar";
import { formatRelativeActivity } from "@/lib/moderation/spectator";
import type { ModerationUserFeedEntry } from "@/lib/moderation/types";

type Props = {
  feed: ModerationUserFeedEntry[];
  loading: boolean;
  selectedUsername: string;
  onSelect: (entry: ModerationUserFeedEntry) => void;
  compact?: boolean;
};

function FeedCardBody({
  entry,
  index,
}: {
  entry: ModerationUserFeedEntry;
  index: number;
}) {
  return (
    <div className="flex items-start gap-3">
      <ChatInboxAvatar
        photo={entry.photoUrl}
        username={entry.username}
        size="md"
        variant="classic"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-base font-bold md:text-lg">{entry.username}</p>
          {index === 0 ? (
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200">
              Ahora
            </span>
          ) : null}
          {entry.unseen ? (
            <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
              Nuevo
            </span>
          ) : null}
        </div>

        <p className="mt-1 line-clamp-2 text-sm font-bold text-white/50">
          {entry.lastMessage || "Sin mensajes aún"}
        </p>

        <p className="mt-1.5 text-xs font-bold text-white/35">
          {formatRelativeActivity(entry.lastActivityMs)}
          {entry.chatCount > 0
            ? ` · ${entry.chatCount} chat${entry.chatCount === 1 ? "" : "s"}`
            : ""}
        </p>
      </div>
    </div>
  );
}

export default function SpectatorLiveFeed({
  feed,
  loading,
  selectedUsername,
  onSelect,
  compact = false,
}: Props) {
  const prevActivityRef = useRef<Record<string, number>>({});
  const bumpedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const bumped = new Set<string>();
    for (const entry of feed) {
      const key = entry.username.toLowerCase();
      const prev = prevActivityRef.current[key] ?? 0;
      if (entry.lastActivityMs > prev && prev > 0) {
        bumped.add(key);
      }
      prevActivityRef.current[key] = entry.lastActivityMs;
    }
    bumpedRef.current = bumped;
    const timer = window.setTimeout(() => {
      bumpedRef.current = new Set();
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [feed]);

  return (
    <div className={compact ? "" : "min-h-0"}>
      {!compact ? (
        <div className="mb-4 md:mb-5">
          <div className="flex items-center gap-2">
            <span className="spectator-live-dot" aria-hidden />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300/80">
              En vivo
            </p>
          </div>
          <p className="mt-2 text-sm font-bold text-white/55 md:text-base">
            Perfiles con actividad reciente arriba. La lista se reordena sola al
            enviar o recibir mensajes.
          </p>
        </div>
      ) : null}

      {loading ? (
        <p className="text-base font-bold text-white/35 md:text-lg">
          Sincronizando actividad...
        </p>
      ) : feed.length === 0 ? (
        <p className="text-base font-bold text-white/35 md:text-lg">
          Sin conversaciones activas por ahora.
        </p>
      ) : (
        <ul className="space-y-2.5 md:space-y-3">
          {feed.map((entry, index) => {
            const key = entry.username.toLowerCase();
            const active =
              selectedUsername.toLowerCase() === entry.username.toLowerCase();
            const bumped = bumpedRef.current.has(key);

            return (
              <li key={entry.username}>
                <button
                  type="button"
                  onClick={() => onSelect(entry)}
                  className={[
                    "group relative w-full overflow-hidden rounded-2xl px-3.5 py-3 text-left transition md:px-4 md:py-3.5",
                    active
                      ? "bg-gradient-to-br from-violet-500/20 via-[#151515] to-[#101010] ring-1 ring-violet-400/35"
                      : "bg-[#121212]/90 ring-1 ring-white/8 hover:ring-white/16",
                    bumped ? "spectator-feed-bump" : "",
                    entry.unseen ? "spectator-feed-unseen" : "",
                  ].join(" ")}
                >
                  <FeedCardBody entry={entry} index={index} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
