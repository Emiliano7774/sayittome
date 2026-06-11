"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";

import { formatRelativeActivity } from "@/lib/moderation/spectator";
import type { ModerationUserFeedEntry } from "@/lib/moderation/types";

type Props = {
  feed: ModerationUserFeedEntry[];
  loading: boolean;
  selectedUsername: string;
  onSelect: (entry: ModerationUserFeedEntry) => void;
  compact?: boolean;
};

function initials(username: string) {
  const clean = String(username || "?").trim();
  return clean.slice(0, 2).toUpperCase();
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
        <motion.ul layout className="space-y-2.5 md:space-y-3">
          <AnimatePresence initial={false}>
            {feed.map((entry, index) => {
              const key = entry.username.toLowerCase();
              const active =
                selectedUsername.toLowerCase() === entry.username.toLowerCase();
              const bumped = bumpedRef.current.has(key);

              return (
                <motion.li
                  key={entry.username}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ layout: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
                >
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
                    <div className="flex items-start gap-3">
                      <div
                        className={[
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold md:h-12 md:w-12",
                          entry.unseen
                            ? "bg-gradient-to-br from-amber-400/30 to-orange-500/10 text-amber-100"
                            : "bg-white/8 text-white/70",
                        ].join(" ")}
                      >
                        {initials(entry.username)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-base font-bold md:text-lg">
                            {entry.username}
                          </p>
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
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}
