"use client";

import { Check, CheckCheck } from "lucide-react";

import ChatInboxLink from "@/components/chats/ChatInboxLink";
import ChatsSelectionToolbar, {
  ChatSelectionCheckbox,
} from "@/components/chats/ChatsSelectionToolbar";
import ChatInboxPeerAvatar from "@/components/chats/ChatInboxPeerAvatar";
import ChatPendingIndicator from "@/components/chat/ChatPendingIndicator";
import ClassicUxModeBar from "@/components/classic/ClassicUxModeBar";
import { formatClassicInboxTime } from "@/lib/chat/inboxTime";
import { chatHref, type InboxChat } from "@/hooks/useChatsInbox";
import { isOwnInboxLastSender } from "@/lib/chat/incomingChatActivity";
import { chatPeerTitle, resolveChatViewerId, shouldHidePeerProfilePhoto, shouldShowAnonPeerInbox } from "@/lib/chat/inboxPeerTitle";
import { chatUnreadCountForViewer } from "@/lib/chat/inboxUnread";
import { isMessageSeenByOther } from "@/lib/chat/messageReceipt";
import { getLocalChatReadVersion, subscribeLocalChatRead } from "@/lib/chat/localChatRead";
import { inboxChatBlur, inboxChatPhoto, useInboxProfilePhotos } from "@/hooks/useInboxProfilePhotos";
import type { useChatsSelection } from "@/hooks/useChatsSelection";
import { useT } from "@/contexts/LocaleContext";
import { useSyncExternalStore } from "react";

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
  blurPhoto,
  unread,
  isAnonPeer,
  anonKey,
}: {
  chat: InboxChat;
  uid: string;
  t: ReturnType<typeof useT>;
  selectionMode: boolean;
  selected: boolean;
  onToggle: () => void;
  photo: string;
  blurPhoto: boolean;
  unread: number;
  isAnonPeer: boolean;
  anonKey: string;
}) {
  const chatViewerId = resolveChatViewerId(chat, uid);
  const title = chatPeerTitle(chat, uid);
  const lastSender = String(chat.lastMessageSender || "").trim();
  const timeLabel = formatClassicInboxTime(chat, chatViewerId, t, uid);
  const mine = isOwnInboxLastSender(chat, chatViewerId, uid);
  const readByOther =
    mine &&
    isMessageSeenByOther(chat.readBy, lastSender || chatViewerId, uid, chat);

  const rowClass =
    "flex w-full items-center gap-3.5 border-b border-white/10 px-4 py-3.5 transition active:bg-white/[0.03] " +
    (unread > 0 ? "bg-white/[0.07]" : "");

  const content = (
    <>
      {selectionMode ? <ChatSelectionCheckbox checked={selected} variant="classic" /> : null}

      <ChatInboxPeerAvatar
        chat={chat}
        viewerUid={uid}
        photo={shouldHidePeerProfilePhoto(chat, uid) ? "" : photo}
        username={title}
        size="md"
        blurPhoto={blurPhoto}
        variant="classic"
        anonAvatar={isAnonPeer}
        anonKey={anonKey}
      />

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[17px] tracking-[-0.02em] ${
            unread > 0 ? "font-black text-white" : "font-semibold text-white/45"
          }`}
        >
          {title}
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm">
          {mine ? (
            readByOther ? (
              <CheckCheck size={14} className="shrink-0 text-white/28" strokeWidth={2} />
            ) : (
              <Check size={14} className="shrink-0 text-white/28" strokeWidth={2} />
            )
          ) : null}
          <span
            className={`truncate ${
              unread > 0 ? "font-black text-white" : "font-medium text-white/32"
            }`}
          >
            {chat.lastMessage || t("chats_no_messages")}
          </span>
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2 pl-2">
        {timeLabel ? (
          <span className="whitespace-nowrap text-[11px] font-medium text-white/32">{timeLabel}</span>
        ) : null}
        {unread > 0 ? (
          <ChatPendingIndicator className="relative" />
        ) : null}
      </div>
    </>
  );

  if (selectionMode) {
    return (
      <button
        type="button"
        data-nav-chat-row
        onClick={onToggle}
        className={`${rowClass} w-full text-left`}
      >
        {content}
      </button>
    );
  }

  return (
    <ChatInboxLink href={chatHref(chat)} className={rowClass} data-nav-chat-row>
      {content}
    </ChatInboxLink>
  );
}

export default function ClassicChatsInbox({
  sortedChats,
  uid,
  isAnonymousSession: _isAnonymousSession,
  selection,
}: Props) {
  const t = useT();
  const { photos, blurPhotos } = useInboxProfilePhotos(sortedChats);
  useSyncExternalStore(subscribeLocalChatRead, getLocalChatReadVersion, () => 0);

  return (
    <main className="min-h-screen bg-black pb-32 text-white" data-nav-primary-content>
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
          chats={sortedChats}
          uid={uid}
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
          <div data-nav-chats-primary>
          {sortedChats.map((chat) => {
            const title = chatPeerTitle(chat, uid);
            const isAnonPeer = shouldShowAnonPeerInbox(chat, uid);

            return (
            <ClassicChatRow
              key={chat.id}
              chat={chat}
              uid={uid}
              t={t}
              photo={inboxChatPhoto(chat, photos)}
              blurPhoto={inboxChatBlur(chat, blurPhotos)}
              unread={chatUnreadCountForViewer(chat, uid)}
              selectionMode={selection.selectionMode}
              selected={selection.selectedIds.has(chat.id)}
              onToggle={() => selection.toggleChat(chat.id)}
              isAnonPeer={isAnonPeer}
              anonKey={chat.anonSessionId || chat.id}
            />
            );
          })}
          </div>
        )}
      </div>
    </main>
  );
}
