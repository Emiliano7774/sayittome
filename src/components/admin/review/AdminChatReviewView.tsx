"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useUserModerationChats } from "@/hooks/useClassicModerationFeed";
import { usePhoneShell } from "@/hooks/usePhoneShell";
import { chatActivityMs } from "@/lib/moderation/classicFeed";
import {
  markModerationChatSeen,
  markModerationUserSeen,
} from "@/lib/moderation/markSeen";
import type { ModerationChatRow } from "@/lib/moderation/types";

import AdminChatHistoryList from "./AdminChatHistoryList";
import AdminChatMirror from "./AdminChatMirror";

type Props = {
  username: string;
  preferredChatId?: string;
  onBack?: () => void;
  showBack?: boolean;
};

export default function AdminChatReviewView({
  username,
  preferredChatId = "",
  onBack,
  showBack = false,
}: Props) {
  const phoneShell = usePhoneShell();
  const { chats, uid, loading } = useUserModerationChats(username);
  const [selectedChatId, setSelectedChatId] = useState("");
  const markedSeenRef = useRef(false);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) || null,
    [chats, selectedChatId],
  );

  useEffect(() => {
    markedSeenRef.current = false;
    setSelectedChatId("");
  }, [username]);

  useEffect(() => {
    if (!username || loading || chats.length === 0) return;

    const preferred =
      preferredChatId && chats.some((chat) => chat.id === preferredChatId)
        ? preferredChatId
        : chats[0].id;

    setSelectedChatId((current) => current || preferred);
  }, [username, chats, loading, preferredChatId]);

  useEffect(() => {
    if (!username || loading || markedSeenRef.current) return;
    const latest = chats[0] ? chatActivityMs(chats[0]) : 0;
    if (!latest) return;
    markedSeenRef.current = true;
    void markModerationUserSeen(username, latest);
  }, [username, chats, loading]);

  useEffect(() => {
    if (!selectedChatId) return;
    void markModerationChatSeen(selectedChatId);
  }, [selectedChatId]);

  function openChat(chat: ModerationChatRow) {
    setSelectedChatId(chat.id);
  }

  if (loading) {
    return <p className="text-lg font-bold text-white/35">Cargando historial...</p>;
  }

  return (
    <div className="flex min-h-[min(78dvh,760px)] flex-col">
      {showBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 self-start rounded-full border border-white/15 bg-[#111] px-4 py-2 text-sm font-bold"
        >
          ← Volver
        </button>
      ) : null}

      <div
        className={[
          "min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#080808]",
          phoneShell ? "flex flex-col" : "grid grid-cols-[minmax(280px,340px)_minmax(0,1fr)]",
        ].join(" ")}
      >
        <div
          className={[
            "min-h-0 border-white/10",
            phoneShell ? "max-h-[42vh] shrink-0 border-b" : "h-full border-r",
          ].join(" ")}
        >
          <AdminChatHistoryList
            chats={chats}
            profileUsername={username}
            selectedChatId={selectedChatId}
            onSelect={openChat}
            fullHeight={!phoneShell}
          />
        </div>

        <div className="min-h-0 flex-1">
          <AdminChatMirror
            profileUsername={username}
            profileUid={uid}
            chat={selectedChat}
            fullHeight
          />
        </div>
      </div>
    </div>
  );
}
