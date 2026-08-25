"use client";

import Link from "next/link";
import { Check, CheckCheck, MessageSquare } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import ChatInboxLink from "@/components/chats/ChatInboxLink";
import ChatsMarkAllSeenButton from "@/components/chats/ChatsMarkAllSeenButton";
import ChatsSelectionToolbar, {
  ChatSelectionCheckbox,
} from "@/components/chats/ChatsSelectionToolbar";
import ChatInboxPeerAvatar from "@/components/chats/ChatInboxPeerAvatar";
import ChatPendingIndicator from "@/components/chat/ChatPendingIndicator";
import ModernPageHeader from "@/components/modern/ModernPageHeader";
import { formatClassicInboxTime } from "@/lib/chat/inboxTime";
import { chatHref, type InboxChat } from "@/hooks/useChatsInbox";
import { isOwnInboxLastSender } from "@/lib/chat/incomingChatActivity";
import { chatPeerTitle, resolveChatViewerId, shouldHidePeerProfilePhoto, shouldShowAnonPeerInbox } from "@/lib/chat/inboxPeerTitle";
import { chatUnreadCountForViewer } from "@/lib/chat/inboxUnread";
import { isMessageSeenByOther } from "@/lib/chat/messageReceipt";
import { getLocalChatReadVersion, subscribeLocalChatRead } from "@/lib/chat/localChatRead";
import { inboxChatBlur, inboxChatPhoto, useInboxProfilePhotos } from "@/hooks/useInboxProfilePhotos";
import type { useChatsSelection } from "@/hooks/useChatsSelection";
import { restoreChatsListScroll } from "@/lib/navigation/chatsListScrollStore";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  sortedChats: InboxChat[];
  uid: string;
  isAnonymousSession: boolean;
  selection: ReturnType<typeof useChatsSelection>;
};

export default function ModernChatsInbox({
  sortedChats,
  uid,
  isAnonymousSession,
  selection,
}: Props) {
  const t = useT();
  const { photos, blurPhotos } = useInboxProfilePhotos(sortedChats);
  useSyncExternalStore(subscribeLocalChatRead, getLocalChatReadVersion, () => 0);

  useEffect(() => {
    if (sortedChats.length === 0) return;
    restoreChatsListScroll();
  }, [sortedChats.length]);

  return (
    <main className="min-h-screen bg-black pb-32 text-white" data-nav-primary-content>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
        {selection.selectionMode ? (
          <ChatsSelectionToolbar
            variant="modern"
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
        ) : (
          <ModernPageHeader
            title={t("chats_title")}
            subtitle={t("chats_subtitle")}
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ChatsMarkAllSeenButton
                  chats={sortedChats}
                  uid={uid}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-black text-violet-300 disabled:opacity-35"
                />
                <button
                  type="button"
                  onClick={selection.enterSelectionMode}
                  disabled={sortedChats.length === 0}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-black text-violet-300 disabled:opacity-35"
                >
                  {t("chats_select")}
                </button>
              </div>
            }
          />
        )}

        {isAnonymousSession ? (
          <div className="mb-5 rounded-2xl border border-violet-500/15 bg-violet-500/5 p-4 text-sm font-bold text-white/55">
            {t("chats_anon_banner")}
          </div>
        ) : null}

        {sortedChats.length === 0 ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center text-white/35">
            <MessageSquare size={48} className="text-violet-300/40" />
            <p className="mt-4 text-2xl font-black">{t("chats_empty")}</p>
            <Link
              href="/shuffle"
              className="mt-6 rounded-full bg-violet-600 px-6 py-3 text-sm font-black"
            >
              {t("home_go_shuffle")}
            </Link>
          </div>
        ) : (
          <div className="space-y-3" data-nav-chats-primary>
            {sortedChats.map((chat) => {
              const chatViewerId = resolveChatViewerId(chat, uid);
              const unread = chatUnreadCountForViewer(chat, uid);
              const title = chatPeerTitle(chat, uid);
              const selected = selection.selectedIds.has(chat.id);
              const photo = shouldHidePeerProfilePhoto(chat, uid)
                ? ""
                : inboxChatPhoto(chat, photos);
              const isAnonPeer = shouldShowAnonPeerInbox(chat, uid);
              const blurPhoto = inboxChatBlur(chat, blurPhotos);
              const lastSender = String(chat.lastMessageSender || "").trim();
              const timeLabel = formatClassicInboxTime(chat, chatViewerId, t, uid);
              const mine = isOwnInboxLastSender(chat, chatViewerId, uid);
              const readByOther =
                mine &&
                isMessageSeenByOther(chat.readBy, lastSender || chatViewerId, uid, chat);
              const cardClass =
                "group relative z-10 flex w-full items-center gap-4 rounded-2xl border p-4 shadow-[0_0_30px_rgba(0,0,0,.35)] transition active:scale-[0.99] " +
                (selected
                  ? "border-violet-500/40 bg-violet-500/10"
                  : unread > 0
                    ? "border-orange-500/25 bg-[#141414] hover:border-orange-500/35"
                    : "border-white/8 bg-[#0c0c0c]/90 hover:border-violet-500/25 hover:bg-[#121212]");

              const inner = (
                <>
                  {selection.selectionMode ? (
                    <ChatSelectionCheckbox checked={selected} variant="modern" />
                  ) : null}

                  <ChatInboxPeerAvatar
                    chat={chat}
                    viewerUid={uid}
                    photo={photo}
                    username={title}
                    size="lg"
                    blurPhoto={blurPhoto}
                    variant="modern"
                    anonAvatar={isAnonPeer}
                    anonKey={chat.anonSessionId || chat.id}
                  />

                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-lg ${
                        unread > 0 ? "font-black text-white" : "font-bold text-white/45"
                      }`}
                    >
                      {title}
                    </p>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-sm">
                      {mine ? (
                        readByOther ? (
                          <CheckCheck size={14} className="shrink-0 text-violet-400/80" strokeWidth={2} />
                        ) : (
                          <Check size={14} className="shrink-0 text-white/28" strokeWidth={2} />
                        )
                      ) : null}
                      <span
                        className={`truncate ${
                          unread > 0 ? "font-black text-white" : "font-semibold text-white/30"
                        }`}
                      >
                        {chat.lastMessage || t("chats_no_messages")}
                      </span>
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2 pl-2">
                    {timeLabel && !selection.selectionMode ? (
                      <span className="whitespace-nowrap text-[11px] font-medium text-white/32">
                        {timeLabel}
                      </span>
                    ) : null}
                    {unread > 0 && !selection.selectionMode ? (
                      <ChatPendingIndicator className="relative" />
                    ) : null}
                  </div>
                </>
              );

              if (selection.selectionMode) {
                return (
                  <button
                    key={chat.id}
                    type="button"
                    data-nav-chat-row
                    onClick={() => selection.toggleChat(chat.id)}
                    className={`${cardClass} w-full text-left`}
                  >
                    {inner}
                  </button>
                );
              }

              return (
                <ChatInboxLink key={chat.id} href={chatHref(chat)} className={cardClass} data-nav-chat-row>
                  {inner}
                </ChatInboxLink>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
