"use client";

import { motion } from "framer-motion";

import {
  getConversationType,
  groupChatsByTemporal,
  isChatUnseen,
} from "@/lib/moderation/classicFeed";
import { formatRelativeActivity } from "@/lib/moderation/spectator";
import type { ModerationChatRow } from "@/lib/moderation/types";

type Props = {
  chats: ModerationChatRow[];
  profileUsername: string;
  selectedChatId: string;
  onSelect: (chat: ModerationChatRow) => void;
  loading?: boolean;
};

export default function SpectatorChatRail({
  chats,
  profileUsername,
  selectedChatId,
  onSelect,
  loading = false,
}: Props) {
  const sections = groupChatsByTemporal(chats, profileUsername);

  if (loading) {
    return (
      <p className="text-sm font-bold text-white/35">Cargando conversaciones...</p>
    );
  }

  if (sections.length === 0) {
    return (
      <p className="text-sm font-bold text-white/35">
        Este perfil no tiene chats visibles todavía.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <section key={section.id}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/38">
            {section.label}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {section.chats.map((chat) => {
              const active = selectedChatId === chat.id;
              const unseen = isChatUnseen(chat);

              return (
                <motion.button
                  key={chat.id}
                  layout
                  type="button"
                  onClick={() => onSelect(chat)}
                  whileTap={{ scale: 0.98 }}
                  className={[
                    "min-w-[190px] shrink-0 rounded-2xl px-3 py-2.5 text-left transition md:min-w-[210px]",
                    active
                      ? "bg-violet-500/18 ring-1 ring-violet-400/35"
                      : "bg-white/6 ring-1 ring-white/10 hover:ring-white/18",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold">
                      {getConversationType(chat, profileUsername)}
                    </p>
                    {unseen ? (
                      <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-200">
                        Nuevo
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs font-bold text-white/45">
                    {chat.lastMessage || "Sin mensajes"}
                  </p>
                  <p className="mt-1 text-[10px] font-bold text-white/30">
                    {formatRelativeActivity(chat.updatedAt?.toMillis?.() ?? 0)}
                  </p>
                </motion.button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
