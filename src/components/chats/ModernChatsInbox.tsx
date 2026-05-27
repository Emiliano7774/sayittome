"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";

import ChatsSelectionToolbar, {
  ChatSelectionCheckbox,
} from "@/components/chats/ChatsSelectionToolbar";
import ChatPeerAvatar from "@/components/chat/ChatPeerAvatar";
import ModernPageHeader from "@/components/modern/ModernPageHeader";
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

export default function ModernChatsInbox({
  sortedChats,
  uid,
  isAnonymousSession,
  selection,
}: Props) {
  const t = useT();
  const photos = useInboxProfilePhotos(sortedChats);

  return (
    <main className="min-h-screen bg-black pb-32 text-white">
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
              <button
                type="button"
                onClick={selection.enterSelectionMode}
                disabled={sortedChats.length === 0}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-black text-violet-300 disabled:opacity-35"
              >
                {t("chats_select")}
              </button>
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
          <div className="space-y-3">
            {sortedChats.map((chat) => {
              const unread = uid ? chat.unreadCounts?.[uid] || 0 : 0;
              const title = chatTitle(chat);
              const selected = selection.selectedIds.has(chat.id);
              const photo = inboxChatPhoto(chat, photos);
              const cardClass =
                "group relative z-10 flex items-center gap-4 rounded-2xl border p-4 shadow-[0_0_30px_rgba(0,0,0,.35)] transition active:scale-[0.99] " +
                (selected
                  ? "border-violet-500/40 bg-violet-500/10"
                  : "border-white/8 bg-[#0c0c0c]/90 hover:border-violet-500/25 hover:bg-[#121212]");

              const inner = (
                <>
                  {selection.selectionMode ? (
                    <ChatSelectionCheckbox checked={selected} variant="modern" />
                  ) : null}

                  <ChatPeerAvatar photo={photo} username={title} size="lg" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-black">{title}</p>
                    <p className="truncate text-sm font-bold text-white/35">
                      {chat.lastMessage || t("chats_no_messages")}
                    </p>
                  </div>

                  {unread > 0 && !selection.selectionMode ? (
                    <span className="rounded-full bg-violet-600 px-2.5 py-1 text-xs font-black">
                      {unread}
                    </span>
                  ) : null}
                </>
              );

              if (selection.selectionMode) {
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => selection.toggleChat(chat.id)}
                    className={`${cardClass} w-full text-left`}
                  >
                    {inner}
                  </button>
                );
              }

              return (
                <Link key={chat.id} href={chatHref(chat)} prefetch={false} className={cardClass}>
                  {inner}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
