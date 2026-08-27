"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";

import AdminSpectatorMessageContent from "@/components/admin/review/AdminSpectatorMessageContent";
import { useAdminApi } from "@/components/admin/AdminShell";
import { useSpectatorChatMessages } from "@/hooks/useSpectatorTheater";
import { resolveModerationParticipants } from "@/lib/moderation/chatReview";
import { chatActivityMs } from "@/lib/moderation/classicFeed";
import {
  formatMessageTime,
  formatRelativeActivity,
  resolveSpectatorMessageSide,
  spectatorMessageSenderLabel,
} from "@/lib/moderation/spectator";
import type { ModerationChatRow } from "@/lib/moderation/types";

type Props = {
  profileUsername: string;
  profileUid?: string;
  chat: ModerationChatRow | null;
  onBack?: () => void;
  showBack?: boolean;
};

export default function SpectatorTheater({
  profileUsername,
  profileUid,
  chat,
  onBack,
  showBack = false,
}: Props) {
  const admin = useAdminApi();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { chronological, loading, hasNewSinceLastRender } = useSpectatorChatMessages(
    chat?.id || "",
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: hasNewSinceLastRender ? "smooth" : "auto" });
  }, [chronological, hasNewSinceLastRender]);

  if (!chat) {
    return (
      <div className="spectator-theater flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl px-6 text-center md:min-h-[480px]">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/35">
          Modo espectador
        </p>
        <p className="mt-3 max-w-sm text-base font-bold text-white/55 md:text-lg">
          Tocá un perfil del feed para ver la conversación cobrar vida en tiempo real.
        </p>
      </div>
    );
  }

  const participants = resolveModerationParticipants(chat, profileUsername);
  const activityMs = chatActivityMs(chat);

  return (
    <div className="spectator-theater flex h-full min-h-[420px] flex-col overflow-hidden rounded-3xl md:min-h-[560px]">
      <div className="relative z-10 border-b border-white/8 bg-black/35 px-4 py-3 backdrop-blur-md md:px-5 md:py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {showBack && onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="mb-2 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/70"
              >
                ← Volver al feed
              </button>
            ) : null}

            <div className="flex items-center gap-2">
              <span className="spectator-live-dot" aria-hidden />
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/85">
                Observando en vivo
              </p>
            </div>

            <p className="mt-2 text-lg font-bold md:text-xl">{participants.headline}</p>
            <p className="mt-1 text-xs font-bold text-white/40">
              {participants.directionHint} · {formatRelativeActivity(activityMs)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                admin.postAction({ action: "mark_chat_suspicious", chatId: chat.id })
              }
              className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-100"
            >
              Sospechoso
            </button>
            <button
              type="button"
              onClick={() => admin.postAction({ action: "delete_chat", chatId: chat.id })}
              className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-200"
            >
              Borrar hilo
            </button>
            <Link
              href={`/chat/${encodeURIComponent(chat.id)}?u=${encodeURIComponent(profileUsername)}`}
              className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/75"
            >
              Abrir chat
            </Link>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative z-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-5 md:py-5"
      >
        {loading ? (
          <p className="text-center text-sm font-bold text-white/35">
            Cargando mensajes...
          </p>
        ) : chronological.length === 0 ? (
          <p className="text-center text-sm font-bold text-white/35">
            Todavía no hay mensajes en este hilo.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {chronological.map((msg) => {
              const side = resolveSpectatorMessageSide(
                msg,
                chat,
                profileUsername,
                profileUid,
              );
              const isProfile = side === "profile";
              const senderLabel = spectatorMessageSenderLabel(
                msg,
                chat,
                profileUsername,
                profileUid,
              );

              return (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className={[
                    "flex w-full",
                    isProfile ? "justify-end" : "justify-start",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "max-w-[88%] rounded-2xl px-3.5 py-2.5 md:max-w-[78%] md:px-4 md:py-3",
                      isProfile
                        ? "rounded-br-md bg-gradient-to-br from-violet-500/35 to-indigo-600/20 text-white shadow-[0_8px_24px_rgba(88,28,135,0.18)]"
                        : "rounded-bl-md bg-white/10 text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.22)]",
                    ].join(" ")}
                  >
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-white/45">
                      {senderLabel}
                      {isProfile ? " · perfil" : participants.peerIsAnon ? " · visitante" : ""}
                    </p>
                    <AdminSpectatorMessageContent chatId={chat.id} msg={msg} />
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-bold text-white/35">
                        {formatMessageTime(msg)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          admin.postAction({
                            action: "delete_message",
                            chatId: chat.id,
                            messageId: msg.id,
                            collectionName: msg.collectionName,
                          })
                        }
                        className="text-[10px] font-bold text-red-300/80 hover:text-red-200"
                      >
                        Borrar
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
