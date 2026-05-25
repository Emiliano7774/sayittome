"use client";

import Link from "next/link";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import {
  useEffect,
  useState,
} from "react";

import {
  auth,
  db,
} from "@/lib/firebase";

type InboxChat = {
  id: string;

  targetUsername?: string;

  lastMessage?: string;

  unreadCounts?: Record<
    string,
    number
  >;
};

export default function ChatsPage() {
  const [
    chats,
    setChats,
  ] = useState<
    InboxChat[]
  >([]);

  useEffect(() => {
    const uid =
      auth.currentUser?.uid;

    if (!uid) return;

    const q = query(
      collection(
        db,
        "chats",
      ),

      where(
        "participantes",
        "array-contains",
        uid,
      ),
    );

    return onSnapshot(
      q,

      (snap) => {
        setChats(
          snap.docs.map(
            (d) =>
              ({
                id: d.id,
                ...d.data(),
              }) as InboxChat,
          ),
        );
      },
    );
  }, []);

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">

      <h1 className="mb-10 text-6xl font-black tracking-[-0.08em]">
        Chats
      </h1>

      <div className="space-y-5">
        {chats.map(
          (chat) => {
            const unread =
              Object.values(
                chat.unreadCounts ||
                  {},
              )[0] || 0;

            return (
              <Link
                key={chat.id}
                href="/shuffle"
                className="flex items-center justify-between rounded-[28px] bg-[#111111] px-5 py-5"
              >
                <div>
                  <p className="text-3xl font-bold">
                    {
                      chat.targetUsername
                    }
                  </p>

                  <p className="mt-2 text-2xl text-zinc-500">
                    {
                      chat.lastMessage
                    }
                  </p>
                </div>

                {unread > 0 ? (
                  <div className="flex h-12 min-w-12 items-center justify-center rounded-full bg-violet-600 px-3 text-xl font-bold">
                    {unread}
                  </div>
                ) : null}
              </Link>
            );
          },
        )}
      </div>
    </main>
  );
}

