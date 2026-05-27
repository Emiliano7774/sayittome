"use client";

import Link from "next/link";
import { Check, CheckCheck } from "lucide-react";

import ChatsSelectionToolbar, {
  ChatSelectionCheckbox,
} from "@/components/chats/ChatsSelectionToolbar";
import ChatPeerAvatar from "@/components/chat/ChatPeerAvatar";
import ClassicUxModeBar from "@/components/classic/ClassicUxModeBar";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { formatClassicInboxTime } from "@/lib/chat/inboxTime";
import { chatHref, chatTitle, type InboxChat } from "@/hooks/useChatsInbox";
import { inboxChatPhoto, useInboxProfilePhotos } from "@/hooks/useInboxProfilePhotos";
import type { useChatsSelection } from "@/hooks/useChatsSelection";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  sortedChats: InboxChat[];
  uid: string;
  isAnonymousSession: boolean;
  selection: ReturnType<typeof useChatsSelection>;
};

function ClassicChatRow({
  chat,
  uid,
  t,
  selectionMode,
  selected,
  onToggle,
  photo,
}: {
  chat: InboxChat;
  uid: string;
  t: ReturnType<typeof useT>;
  selectionMode: boolean;
  selected: boolean;
  onToggle: () => void;
  photo: string;
}) {
  const viewerId = uid || getChatAnonSenderId();
  const unread = uid ? chat.unreadCounts?.[uid] || 0 : 0;
  const title = chatTitle(chat);
  const timeLabel = formatClassicInboxTime(chat, viewerId, t);
  const mine = chat.lastMessageSender === viewerId;
  const readByOther = Object.entries(chat.readBy || {}).some(
    ([key, value]) => key !== viewerId && value === true,
  );

  const rowClass =
    "flex items-center gap-3.5 border-b border-white/10 px-4 py-3.5 transition active:bg-white/[0.03]";

  const content = (
    <>
      {selectionMode ? <ChatSelectionCheckbox checked={selected} variant="classic" /> : null}

      <ChatPeerAvatar photo={photo} username={title} size="md" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-bold tracking-[-0.02em] text-white">{title}</p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-white/38">
          {mine ? (
            readByOther ? (
              <CheckCheck size={14} className="shrink-0 text-white/28" strokeWidth={2} />
            ) : (
              <Check size={14} className="shrink-0 text-white/28" strokeWidth={2} />
            )
          ) : null}
          <span className="truncate">{chat.lastMessage || t("chats_no_messages")}</span>
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2 pl-2">
        {timeLabel ? (
          <span className="whitespace-nowrap text-[11px] font-medium text-white/32">{timeLabel}</span>
        ) : null}
        {unread > 0 ? (
          <span className="h-2 w-2 rounded-full bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,.55)]" />
        ) : null}
      </div>
    </>
  );

  if (selectionMode) {
    return (
      <button type="button" onClick={onToggle} className={`${rowClass} w-full text-left`}>
        {content}
      </button>
    );
  }

  return (
    <Link href={chatHref(chat)} prefetch={false} className={rowClass}>
      {content}
    </Link>
  );
}

export default function ClassicChatsInbox({
  sortedChats,
  uid,
  isAnonymousSession: _isAnonymousSession,
  selection,
}: Props) {
  const t = useT();
  const photos = useInboxProfilePhotos(sortedChats);

  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="pt-[max(0.75rem,env(safe-area-inset-top))]">
        <ClassicUxModeBar className="px-4 pb-2" />

        <ChatsSelectionToolbar
          variant="classic"
          selectionMode={selection.selectionMode}
          selectedCount={selection.selectedCount}
          allSelected={selection.allSelected}
          hasChats={sortedChats.length > 0}
          deleting={selection.deleting}
          confirmOpen={selection.confirmOpen}
          onEnterSelection={selection.enterSelectionMode}
          onExitSelection={selection.exitSelectionMode}
          onToggleSelectAll={selection.toggleSelectAll}
          onRequestDelete={selection.requestDeleteSelected}
          onConfirmDelete={() => {
            selection.confirmDeleteSelected().catch(() => {
              window.alert(t("chat_save_fail"));
            });
          }}
          onCancelConfirm={() => selection.setConfirmOpen(false)}
        />

        {sortedChats.length === 0 ? (
          <div className="flex min-h-[60vh] items-center justify-center px-6">
            <p className="text-center text-sm font-bold tracking-wide text-white/28">
              {t("chats_empty")}
            </p>
          </div>
        ) : (
          sortedChats.map((chat) => (
            <ClassicChatRow
              key={chat.id}
              chat={chat}
              uid={uid}
              t={t}
              photo={inboxChatPhoto(chat, photos)}
              selectionMode={selection.selectionMode}
              selected={selection.selectedIds.has(chat.id)}
              onToggle={() => selection.toggleChat(chat.id)}
            />
          ))
        )}
      </div>
    </main>
  );
}
