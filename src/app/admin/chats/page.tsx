"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

const ADMIN_EMAIL = "emilianomaturano@gmail.com";

type ChatData = {
  id: string;
  lastMessage?: string;
  lastMessageSender?: string;
  participantes?: string[];
  updatedAt?: any;
  anon?: boolean;
};

export default function AdminChatsPage() {
  const [allowed, setAllowed] = useState(false);
  const [chats, setChats] = useState<ChatData[]>([]);

  useEffect(() => {
    const email = auth.currentUser?.email || "";
    setAllowed(email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  }, []);

  useEffect(() => {
    if (!allowed) return;

    const q = query(
      collection(db, "chats"),
      orderBy("updatedAt", "desc"),
      limit(100)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const docs: ChatData[] = [];

      snapshot.forEach((docu) => {
        docs.push({
          id: docu.id,
          ...(docu.data() as any),
        });
      });

      setChats(docs);
    });

    return () => unsub();
  }, [allowed]);

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Acceso denegado.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-300">
              ADMIN
            </p>

            <h1 className="mt-2 text-5xl font-black">Chats</h1>
          </div>

          <Link
            href="/admin"
            className="rounded-full border border-white/10 bg-zinc-950 px-5 py-3 text-sm font-black"
          >
            Volver
          </Link>
        </div>

        <div className="space-y-4">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className="rounded-[2rem] border border-white/10 bg-zinc-950 p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
                    {chat.anon ? "AnÃ³nimo" : "Chat"} Â· {chat.id}
                  </p>

                  <h2 className="mt-2 truncate text-xl font-black">
                    {chat.lastMessage || "Sin Ãºltimo mensaje"}
                  </h2>

                  <p className="mt-2 break-all text-sm text-zinc-500">
                    Participantes: {(chat.participantes || []).join(" Â· ") || "sin participantes"}
                  </p>
                </div>

                <Link
                  href={"/chat/" + chat.id}
                  className="rounded-full bg-white px-5 py-3 text-sm font-black text-black"
                >
                  Abrir chat
                </Link>
              </div>
            </div>
          ))}

          {chats.length === 0 && (
            <div className="rounded-[2rem] border border-dashed border-white/10 p-10 text-center text-zinc-500">
              No hay chats.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
