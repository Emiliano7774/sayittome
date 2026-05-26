"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { chatHref, chatTitle, type InboxChat } from "@/hooks/useChatsInbox";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  sortedChats: InboxChat[];
  uid: string;
  isAnonymousSession: boolean;
};

export default function ClassicChatsInbox({
  sortedChats,
  uid,
  isAnonymousSession,
}: Props) {
  const t = useT();

  return (
    <main className="min-h-screen bg-black px-5 py-8 pb-32 text-white">
      <h1 className="mb-10 text-6xl font-black tracking-[-0.08em]">{t("chats_title")}</h1>

      {isAnonymousSession ? (
        <div className="mb-8 rounded-[28px] border border-white/10 bg-[#111111] p-6 text-white/60">
          <p className="text-2xl font-black">{t("chats_classic_session_title")}</p>
          <p className="mt-2 text-lg">{t("chats_classic_session_body")}</p>
        </div>
      ) : null}

      {sortedChats.length === 0 ? (
        <div className="flex min-h-[42vh] flex-col items-center justify-center text-center text-white/35">
          <MessageSquare size={54} />
          <p className="mt-4 text-3xl font-black">{t("chats_empty")}</p>
        </div>
      ) : null}

      <div className="space-y-5">
        {sortedChats.map((chat) => {
          const unread = uid ? chat.unreadCounts?.[uid] || 0 : 0;
          const title = chatTitle(chat);

          return (
            <Link
              key={chat.id}
              href={chatHref(chat)}
              prefetch={false}
              className="relative z-10 flex items-center justify-between rounded-[28px] bg-[#111111] px-5 py-5 active:scale-[0.99]"
            >
              <div>
                <p className="text-3xl font-black">{title}</p>
                <p className="mt-1 text-lg text-white/35">
                  {chat.lastMessage || t("chats_no_messages")}
                </p>
              </div>

              {unread > 0 ? (
                <span className="rounded-full bg-violet-600 px-3 py-1 text-lg font-black">
                  {unread}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
