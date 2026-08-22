"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";

import { useAdminApi } from "@/components/admin/AdminShell";
import ChatInboxAvatar from "@/components/chats/ChatInboxAvatar";
import { useSpectatorChatMessages } from "@/hooks/useSpectatorTheater";
import { useModerationProfilePhotos } from "@/hooks/useModerationProfilePhotos";
import { chatBubbleShellClass, chatBubbleTextClass } from "@/lib/chat/chatBubbleStyles";
import { chatActivityMs } from "@/lib/moderation/classicFeed";
import { resolveModerationParticipants } from "@/lib/moderation/chatReview";
import {
  formatMessageTime,
  formatRelativeActivity,
  messageDisplayText,
  resolveSpectatorMessageSide,
  spectatorMessageSenderLabel,
} from "@/lib/moderation/spectator";
import type { ModerationChatRow } from "@/lib/moderation/types";

type Props = {
  profileUsername: string;
  profileUid?: string;
  chat: ModerationChatRow | null;
  fullHeight?: boolean;
  lite?: boolean;
};

export default function AdminChatMirror({
  profileUsername,
  profileUid,
  chat,
  fullHeight = false,
  lite = false,
}: Props) {
  const admin = useAdminApi();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageLimit = lite ? 120 : 300;
  const { chronological, loading } = useSpectatorChatMessages(chat?.id || "", messageLimit, {
    live: !lite,
  });

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || loading) return;
    node.scrollTop = node.scrollHeight;
  }, [chat?.id, loading, chronological.length]);

  const participants = chat
    ? resolveModerationParticipants(chat, profileUsername)
    : null;
  const photoTargets = useMemo(
    () =>
      chat && participants
        ? [
            { username: profileUsername, uid: profileUid },
            ...(participants.peerIsAnon
              ? []
              : [{ username: participants.peerLabel }]),
          ]
        : [],
    [chat, participants, profileUid, profileUsername],
  );
  const photos = useModerationProfilePhotos(photoTargets);

  if (!chat || !participants) {
    return (
      <section
        className={[
          "flex items-center justify-center bg-[#050505] px-6 text-center",
          fullHeight ? "h-full min-h-[320px]" : "min-h-[280px] flex-1",
        ].join(" ")}
      >
        <p className="max-w-xs text-sm font-bold text-white/40">
          Elegí una conversación de la lista para leerla como en el chat real.
        </p>
      </section>
    );
  }

  const profilePhoto = photos[profileUsername.toLowerCase()] || "";
  const peerPhoto = participants.peerIsAnon
    ? ""
    : photos[participants.peerLabel.toLowerCase()] || "";

  return (
    <section
      className={[
        "flex min-h-0 flex-col bg-[#050505]",
        fullHeight ? "h-full" : "min-h-0 flex-1",
      ].join(" ")}
    >
      <div className="shrink-0 border-b border-white/10 bg-[#0a0a0a] px-4 py-3 md:px-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/80">
          Lectura del chat
        </p>
        <div className="mt-2 flex items-center gap-3">
          <ChatInboxAvatar
            photo={peerPhoto}
            username={participants.peerLabel}
            size="sm"
            variant="classic"
            anonAvatar={participants.peerIsAnon}
            anonKey={chat.id}
          />
          <span className="text-xs font-bold text-white/35">↔</span>
          <ChatInboxAvatar
            photo={profilePhoto}
            username={profileUsername}
            size="sm"
            variant="classic"
          />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold md:text-lg">{participants.headline}</p>
          </div>
        </div>
        <p className="mt-1 text-xs font-bold text-white/40">{participants.directionHint}</p>
        <p className="mt-1 text-[11px] font-bold text-white/30">
          Última actividad · {formatRelativeActivity(chatActivityMs(chat))}
        </p>

        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              admin.postAction({ action: "mark_chat_suspicious", chatId: chat.id })
            }
            className="rounded border border-amber-400/25 px-2.5 py-1 text-[10px] font-bold text-amber-100"
          >
            Sospechoso
          </button>
          <button
            type="button"
            onClick={() => admin.postAction({ action: "delete_chat", chatId: chat.id })}
            className="rounded border border-red-400/25 px-2.5 py-1 text-[10px] font-bold text-red-200"
          >
            Borrar
          </button>
          <Link
            href={`/chat/${encodeURIComponent(chat.id)}?u=${encodeURIComponent(profileUsername)}`}
            className="rounded border border-white/12 px-2.5 py-1 text-[10px] font-bold text-white/70"
          >
            Abrir chat
          </Link>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4 md:px-5"
      >
        {loading ? (
          <p className="text-center text-sm font-bold text-white/35">Cargando...</p>
        ) : chronological.length === 0 ? (
          <p className="text-center text-sm font-bold text-white/35">Sin mensajes.</p>
        ) : (
          chronological.map((msg) => {
            const isProfile =
              resolveSpectatorMessageSide(msg, chat, profileUsername, profileUid) ===
              "profile";
            const senderLabel = spectatorMessageSenderLabel(
              msg,
              chat,
              profileUsername,
              profileUid,
            );

            return (
              <div
                key={msg.id}
                className={[
                  "flex w-full flex-col gap-1",
                  isProfile ? "items-end" : "items-start",
                ].join(" ")}
              >
                <span className="px-1 text-[10px] font-bold uppercase tracking-wide text-white/35">
                  {senderLabel}
                  {isProfile ? " · perfil" : participants.peerIsAnon ? " · visitante" : ""}
                </span>
                <div className={chatBubbleShellClass(true, isProfile)}>
                  <p className={chatBubbleTextClass(true)}>{messageDisplayText(msg)}</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
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
                      className="text-[10px] font-bold text-red-300/75"
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
