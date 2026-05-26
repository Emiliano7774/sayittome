"use client";

import Link from "next/link";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { inboxDedupeKey, isProfileAnonChatId } from "@/lib/chat/anonChatId";
import {
  buildLegacyProfileChatIds,
  buildProfileAnonChatId,
} from "@/lib/chat/anonChatId";
import { migrateToCanonicalChat } from "@/lib/chat/migrate";
import { getSessionChatIds } from "@/lib/chat/sessionChats";

type InboxChat = {
  id: string;
  targetUsername?: string;
  receptorUsername?: string;
  otherUsername?: string;
  lastMessage?: string;
  updatedAt?: { toMillis?: () => number };
  unreadCounts?: Record<string, number>;
  canonicalChatId?: string;
};

function chatTitle(chat: InboxChat) {
  return chat.targetUsername || chat.receptorUsername || chat.otherUsername || "Chat anónimo";
}

function chatHref(chat: InboxChat) {
  const username = chat.targetUsername || chat.receptorUsername;
  const id = chat.canonicalChatId || chat.id;

  if (username) {
    return `/chat/${encodeURIComponent(id)}?u=${encodeURIComponent(username)}`;
  }

  return `/chat/${encodeURIComponent(id)}`;
}

function dedupeChats(chats: InboxChat[]) {
  const map = new Map<string, InboxChat>();

  for (const chat of chats) {
    const key = inboxDedupeKey(chat);
    const existing = map.get(key);
    const chatMs = chat.updatedAt?.toMillis?.() ?? 0;
    const existingMs = existing?.updatedAt?.toMillis?.() ?? 0;

    if (!existing || chatMs >= existingMs) {
      map.set(key, chat);
    }
  }

  return [...map.values()].sort((a, b) => {
    const av = a.updatedAt?.toMillis?.() ?? 0;
    const bv = b.updatedAt?.toMillis?.() ?? 0;
    return bv - av;
  });
}

export default function ChatsPage() {
  const { firebaseUser, loading } = useAuth();
  const [chats, setChats] = useState<InboxChat[]>([]);
  const [sessionChats, setSessionChats] = useState<InboxChat[]>([]);

  const uid = firebaseUser?.uid || auth.currentUser?.uid || "";

  useEffect(() => {
    if (loading) return;

    if (!uid) {
      setChats([]);
      return;
    }

    const q = query(
      collection(db, "chats"),
      where("participantes", "array-contains", uid),
    );

    return onSnapshot(
      q,
      (snap) => {
        setChats(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<InboxChat, "id">),
          })) as InboxChat[],
        );
      },
      (error) => {
        console.error(error);
        setChats([]);
      },
    );
  }, [uid, loading]);

  useEffect(() => {
    if (loading || uid) {
      setSessionChats([]);
      return;
    }

    const ids = getSessionChatIds();
    if (ids.length === 0) {
      setSessionChats([]);
      return;
    }

    const unsubs = ids.map((chatId) =>
      onSnapshot(doc(db, "chats", chatId), (snap) => {
        if (!snap.exists()) return;

        const data = snap.data() as Omit<InboxChat, "id">;
        setSessionChats((prev) => {
          const next = prev.filter((c) => c.id !== chatId);
          return [
            ...next,
            {
              id: snap.id,
              ...data,
            },
          ];
        });
      }),
    );

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [uid, loading]);

  useEffect(() => {
    if (!uid || loading) return;

    let cancelled = false;

    async function migrateInbox() {
      for (const chat of chats) {
        if (cancelled) return;

        const username = chat.targetUsername || chat.receptorUsername;
        if (!username || !isProfileAnonChatId(chat.id)) continue;

        const canonicalId = buildProfileAnonChatId(uid, username);
        if (chat.id === canonicalId) continue;

        const legacyIds = buildLegacyProfileChatIds(uid, username);
        legacyIds.push(chat.id);

        try {
          await migrateToCanonicalChat(canonicalId, legacyIds, {
            id: canonicalId,
            canonicalChatId: canonicalId,
            targetUsername: username,
            receptorUsername: username,
          });
        } catch (e) {
          console.error("inbox migrate", chat.id, e);
        }
      }
    }

    if (chats.length > 0) {
      migrateInbox();
    }

    return () => {
      cancelled = true;
    };
  }, [chats, uid, loading]);

  const sortedChats = useMemo(() => {
    if (uid) return dedupeChats(chats);
    return dedupeChats(sessionChats);
  }, [chats, sessionChats, uid]);

  return (
    <main className="min-h-screen bg-black px-5 py-8 pb-32 text-white">
      <h1 className="mb-10 text-6xl font-black tracking-[-0.08em]">Chats</h1>

      {!uid && !loading ? (
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
              className="flex items-center justify-between rounded-[28px] bg-[#111111] px-5 py-5 active:scale-[0.99]"
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
