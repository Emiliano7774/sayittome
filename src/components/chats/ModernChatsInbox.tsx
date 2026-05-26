"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";

import ModernPageHeader from "@/components/modern/ModernPageHeader";
import { chatHref, chatTitle, type InboxChat } from "@/hooks/useChatsInbox";

type Props = {
  sortedChats: InboxChat[];
  uid: string;
  isAnonymousSession: boolean;
};

export default function ModernChatsInbox({
  sortedChats,
  uid,
  isAnonymousSession,
}: Props) {
  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
        <ModernPageHeader
          title="Chats"
          subtitle="Mensajes en tiempo real con la misma lógica de siempre."
        />

        {isAnonymousSession ? (
          <div className="mb-5 rounded-2xl border border-violet-500/15 bg-violet-500/5 p-4 text-sm font-bold text-white/55">
            Chats de esta sesión anónima — se guardan en este navegador.
          </div>
        ) : null}

        {sortedChats.length === 0 ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center text-white/35">
            <MessageSquare size={48} className="text-violet-300/40" />
            <p className="mt-4 text-2xl font-black">Todavía no tenés chats.</p>
            <Link
              href="/shuffle"
              className="mt-6 rounded-full bg-violet-600 px-6 py-3 text-sm font-black"
            >
              Ir al Shuffle
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedChats.map((chat) => {
              const unread = uid ? chat.unreadCounts?.[uid] || 0 : 0;
              const title = chatTitle(chat);

              return (
                <Link
                  key={chat.id}
                  href={chatHref(chat)}
                  className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-[#0c0c0c]/90 p-4 shadow-[0_0_30px_rgba(0,0,0,.35)] transition hover:border-violet-500/25 hover:bg-[#121212] active:scale-[0.99]"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600/40 to-fuchsia-600/20 text-lg font-black text-violet-100">
                    {title.slice(0, 1).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-black">@{title.replace(/^@/, "")}</p>
                    <p className="mt-1 truncate text-sm font-bold text-white/45">
                      {chat.lastMessage || "Sin mensajes"}
                    </p>
                  </div>

                  {unread > 0 ? (
                    <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-black shadow-[0_0_16px_rgba(124,58,237,.45)]">
                      {unread}
                    </span>
                  ) : (
                    <span className="text-white/20 transition group-hover:text-violet-300">›</span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
