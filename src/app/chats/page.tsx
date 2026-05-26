"use client";

import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

type InboxChat = {
  id: string;
  targetUsername?: string;
  receptorUsername?: string;
  otherUsername?: string;
  lastMessage?: string;
  updatedAt?: any;
  unreadCounts?: Record<string, number>;
};

function chatTitle(chat: InboxChat) {
  return chat.targetUsername || chat.receptorUsername || chat.otherUsername || "Chat anónimo";
}

export default function ChatsPage() {
  const { firebaseUser, loading } = useAuth();
  const [chats, setChats] = useState<InboxChat[]>([]);

  const uid = firebaseUser?.uid || auth.currentUser?.uid || "";

  useEffect(() => {
    if (loading) return;

    if (!uid) {
      setChats([]);
      return;
    }

    const q = query(
      collection(db, "chats"),
      where("participantes", "array-contains", uid)
    );

    return onSnapshot(
      q,
      (snap) => {
        setChats(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          })) as InboxChat[]
        );
      },
      (error) => {
        console.error(error);
        setChats([]);
      }
    );
  }, [uid, loading]);

  const sortedChats = useMemo(() => {
    return [...chats].sort((a, b) => {
      const av = a.updatedAt?.toMillis?.() ?? 0;
      const bv = b.updatedAt?.toMillis?.() ?? 0;
      return bv - av;
    });
  }, [chats]);

  return (
    <main className="min-h-screen bg-black px-5 py-8 pb-32 text-white">
      <h1 className="mb-10 text-6xl font-black tracking-[-0.08em]">Chats</h1>

      {!uid && !loading ? (
        <div className="rounded-[28px] border border-white/10 bg-[#111111] p-6 text-white/60">
          <p className="text-2xl font-black">Iniciá sesión para ver tus chats guardados.</p>
          <p className="mt-2 text-lg">Los chats totalmente anónimos sin sesión viven solo en esa sesión temporal.</p>
        </div>
      ) : null}

      {uid && sortedChats.length === 0 ? (
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
              href={`/chat/${encodeURIComponent(chat.id)}`}
              className="flex items-center justify-between rounded-[28px] bg-[#111111] px-5 py-5 active:scale-[0.99]"
            >
              <div className="min-w-0">
                <p className="truncate text-3xl font-bold">{title}</p>
                <p className="mt-2 truncate text-2xl text-zinc-500">{chat.lastMessage || "Sin mensajes"}</p>
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
