"use client";

import { useMemo, useState } from "react";

import ChatInboxAvatar from "@/components/chats/ChatInboxAvatar";
import { useModerationProfilePhotos } from "@/hooks/useModerationProfilePhotos";
import type { ModerationPhotoTarget } from "@/hooks/useModerationProfilePhotos";
import { chatActivityMs, isChatUnseen } from "@/lib/moderation/classicFeed";
import {
  formatModerationChatListSubtitle,
  formatModerationChatListTitle,
  getModerationChatPeerLabel,
  resolveModerationParticipants,
} from "@/lib/moderation/chatReview";
import {
  filterChatsByDayKey,
  formatCalendarDayLabel,
  formatChatStoppedAt,
  groupChatsByCalendarDay,
  listAvailableChatDayKeys,
} from "@/lib/moderation/chatHistory";
import type { ModerationChatRow } from "@/lib/moderation/types";

type Props = {
  chats: ModerationChatRow[];
  profileUsername: string;
  profileUid?: string;
  selectedChatId: string;
  onSelect: (chat: ModerationChatRow) => void;
  loading?: boolean;
  fullHeight?: boolean;
};

export default function AdminChatHistoryList({
  chats,
  profileUsername,
  profileUid,
  selectedChatId,
  onSelect,
  loading = false,
  fullHeight = false,
}: Props) {
  const [filterDay, setFilterDay] = useState("");

  const photoTargets = useMemo(() => {
    const targets: ModerationPhotoTarget[] = [
      { username: profileUsername, uid: profileUid },
    ];
    const seen = new Set<string>([profileUsername.toLowerCase()]);

    for (const chat of chats) {
      const participants = resolveModerationParticipants(chat, profileUsername);
      if (participants.peerIsAnon) continue;

      const peer = getModerationChatPeerLabel(chat, profileUsername);
      const key = peer.toLowerCase();
      if (!peer || seen.has(key)) continue;
      seen.add(key);
      targets.push({ username: peer });
    }

    return targets;
  }, [chats, profileUsername, profileUid]);

  const photos = useModerationProfilePhotos(photoTargets);
  const profilePhoto = photos[profileUsername.toLowerCase()] || "";

  const availableDays = useMemo(() => listAvailableChatDayKeys(chats), [chats]);

  const visibleChats = useMemo(
    () => filterChatsByDayKey(chats, filterDay),
    [chats, filterDay],
  );

  const sections = useMemo(
    () => groupChatsByCalendarDay(visibleChats),
    [visibleChats],
  );

  if (loading) {
    return (
      <p className="p-4 text-sm font-bold text-white/35">Cargando historial completo...</p>
    );
  }

  if (chats.length === 0) {
    return (
      <p className="p-4 text-sm font-bold text-white/35">
        Este perfil no tiene conversaciones todavía.
      </p>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#0d0d0d]">
      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <ChatInboxAvatar
            photo={profilePhoto}
            username={profileUsername}
            size="sm"
            variant="classic"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white/85">Historial de {profileUsername}</p>
            <p className="mt-1 text-xs font-bold text-white/40">
              {chats.length} conversaciones en total · ordenadas por última actividad
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wide text-white/35">
            Filtrar por día
          </label>
          <input
            type="date"
            value={filterDay}
            onChange={(event) => setFilterDay(event.target.value)}
            className="rounded-lg border border-white/12 bg-[#111] px-2.5 py-1.5 text-xs font-bold text-white outline-none"
          />
          <button
            type="button"
            onClick={() => setFilterDay("")}
            className={[
              "rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition",
              filterDay
                ? "border-white/12 bg-[#111] text-white/65 hover:border-white/20"
                : "border-violet-400/35 bg-violet-500/12 text-violet-100",
            ].join(" ")}
          >
            Todas las fechas
          </button>
        </div>

        {filterDay ? (
          <p className="mt-2 text-[11px] font-bold text-violet-200/80">
            Mostrando: {formatCalendarDayLabel(filterDay)} · {visibleChats.length} chat
            {visibleChats.length === 1 ? "" : "s"}
          </p>
        ) : availableDays.length > 0 ? (
          <p className="mt-2 text-[11px] font-bold text-white/30">
            Desde {formatCalendarDayLabel(availableDays[availableDays.length - 1])} hasta{" "}
            {formatCalendarDayLabel(availableDays[0])}
          </p>
        ) : null}
      </div>

      <div
        className={[
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          fullHeight ? "" : "max-h-[min(42vh,380px)]",
        ].join(" ")}
      >
        {visibleChats.length === 0 ? (
          <p className="p-4 text-sm font-bold text-white/35">
            No hay chats en la fecha seleccionada.
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.id} className="border-b border-white/6 last:border-b-0">
              <p className="sticky top-0 z-10 border-b border-white/6 bg-[#0d0d0d]/95 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/38 backdrop-blur-sm">
                {section.label}
                <span className="ml-2 text-white/25">({section.chats.length})</span>
              </p>
              <ul>
                {section.chats.map((chat) => {
                  const active = selectedChatId === chat.id;
                  const unseen = isChatUnseen(chat);
                  const title = formatModerationChatListTitle(chat, profileUsername);
                  const subtitle = formatModerationChatListSubtitle(chat, profileUsername);
                  const stoppedAt = formatChatStoppedAt(chatActivityMs(chat));
                  const participants = resolveModerationParticipants(chat, profileUsername);
                  const peerPhoto = participants.peerIsAnon
                    ? ""
                    : photos[getModerationChatPeerLabel(chat, profileUsername).toLowerCase()] || "";

                  return (
                    <li key={chat.id} className="border-b border-white/5 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => onSelect(chat)}
                        className={[
                          "w-full px-4 py-3.5 text-left transition",
                          active
                            ? "bg-violet-600/20 ring-1 ring-inset ring-violet-400/30"
                            : "hover:bg-white/5",
                        ].join(" ")}
                      >
                        <div className="flex items-start gap-3">
                          <ChatInboxAvatar
                            photo={peerPhoto}
                            username={participants.peerLabel}
                            size="sm"
                            variant="classic"
                            anonAvatar={participants.peerIsAnon}
                            anonKey={chat.id}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-white/90">{title}</p>
                                <p className="mt-0.5 truncate text-[11px] font-bold text-white/35">
                                  {subtitle}
                                </p>
                                <p className="mt-1 line-clamp-2 text-xs font-bold text-white/50">
                                  {chat.lastMessage || "Sin mensajes"}
                                </p>
                                <p className="mt-1 text-[10px] font-bold text-white/30">
                                  Última actividad · {stoppedAt}
                                </p>
                              </div>
                              {unseen ? (
                                <span className="mt-0.5 shrink-0 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-black">
                                  Nuevo
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
