"use client";

import {
  chatActivityMs,
  groupChatsByTemporal,
  isChatUnseen,
} from "@/lib/moderation/classicFeed";
import {
  formatModerationChatListSubtitle,
  formatModerationChatListTitle,
} from "@/lib/moderation/chatReview";
import { formatRelativeActivity } from "@/lib/moderation/spectator";
import type { ModerationChatRow } from "@/lib/moderation/types";

type Props = {
  chats: ModerationChatRow[];
  profileUsername: string;
  selectedChatId: string;
  onSelect: (chat: ModerationChatRow) => void;
  loading?: boolean;
  fullHeight?: boolean;
};

export default function AdminChatHistoryList({
  chats,
  profileUsername,
  selectedChatId,
  onSelect,
  loading = false,
  fullHeight = false,
}: Props) {
  const sections = groupChatsByTemporal(chats, profileUsername);

  if (loading) {
    return (
      <p className="p-4 text-sm font-bold text-white/35">Cargando conversaciones...</p>
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
        <p className="text-sm font-bold text-white/85">
          Chats de {profileUsername}
        </p>
        <p className="mt-1 text-xs font-bold text-white/40">
          {chats.length} en total · más reciente arriba
        </p>
      </div>

      <div
        className={[
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          fullHeight ? "" : "max-h-[min(42vh,380px)]",
        ].join(" ")}
      >
        {sections.map((section) => (
          <div key={section.id} className="border-b border-white/6 last:border-b-0">
            <p className="sticky top-0 z-10 border-b border-white/6 bg-[#0d0d0d]/95 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/38 backdrop-blur-sm">
              {section.label}
            </p>
            <ul>
              {section.chats.map((chat) => {
                const active = selectedChatId === chat.id;
                const unseen = isChatUnseen(chat);
                const title = formatModerationChatListTitle(chat, profileUsername);
                const subtitle = formatModerationChatListSubtitle(chat, profileUsername);

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
                            {formatRelativeActivity(chatActivityMs(chat))}
                          </p>
                        </div>
                        {unseen ? (
                          <span className="mt-0.5 shrink-0 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-black">
                            Nuevo
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
