"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { chatHref, chatTitle, type InboxChat } from "@/hooks/useChatsInbox";

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
  return (
    <main className="min-h-screen bg-black px-5 py-8 pb-32 text-white">
      <h1 className="mb-10 text-6xl font-black tracking-[-0.08em]">Chats</h1>

      {isAnonymousSession ? (
        <div className="mb-8 rounded-[28px] border border-white/10 bg-[#111111] p-6 text-white/60">
          <p className="text-2xl font-black">Chats de esta sesión</p>
          <p className="mt-2 text-lg">
            Sin cuenta, los chats se guardan solo en este navegador hasta cerrar la pestaña.
          </p>
        </div>
      ) : null}

      {sortedChats.length === 0 ? (
        <div className="flex min-h-[42vh] flex-col items-center justify-center text-center text-white/35">
          <MessageSquare size={54} />
          <p className="mt-4 text-3xl font-black">Todavía no tenés chats.</p>
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
              <div className="min-w-0">
                <p className="truncate text-3xl font-bold">{title}</p>
                <p className="mt-2 truncate text-2xl text-zinc-500">
                  {chat.lastMessage || "Sin mensajes"}
                </p>
              </div>

              {unread > 0 ? (
                <div className="flex h-12 min-w-12 items-center justify-center rounded-full bg-violet-600 px-3 text-xl font-bold">
                  {unread}
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
