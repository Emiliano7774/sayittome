"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import ChatInboxLink from "@/components/chats/ChatInboxLink";
import { chatHref, type InboxChat } from "@/hooks/useChatsInbox";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { normalizeInboxChat } from "@/lib/chat/normalizeInboxChat";
import { isVisibleInboxChat } from "@/lib/chat/inboxVisible";
import { chatPeerTitle } from "@/lib/chat/inboxPeerTitle";
import { useT } from "@/contexts/LocaleContext";

export default function NativeChatsInboxLite() {
  const t = useT();
  const { firebaseUser, loading: authLoading } = useAuth();
  const [chats, setChats] = useState<InboxChat[]>([]);
  const [ready, setReady] = useState(false);
  const [errorText, setErrorText] = useState("");

  const uid = firebaseUser?.uid || "";

  useEffect(() => {
    if (authLoading) return;

    if (!uid) {
      setChats([]);
      setReady(true);
      return;
    }

    setReady(false);
    setErrorText("");

    const inboxQuery = query(
      collection(db, "chats"),
      where("participantes", "array-contains", uid),
      limit(50),
    );

    const unsub = onSnapshot(
      inboxQuery,
      (snap) => {
        const next = snap.docs
          .map((docSnap) =>
            normalizeInboxChat({
              id: docSnap.id,
              ...(docSnap.data() as Omit<InboxChat, "id">),
            }),
          )
          .filter((chat): chat is InboxChat => Boolean(chat))
          .filter(isVisibleInboxChat)
          .sort((a, b) => {
            const av = a.updatedAt?.toMillis?.() ?? 0;
            const bv = b.updatedAt?.toMillis?.() ?? 0;
            return bv - av;
          });

        setChats(next);
        setReady(true);
      },
      (error) => {
        console.error("native_chats_inbox", error);
        setErrorText(t("chat_save_fail"));
        setReady(true);
      },
    );

    return () => unsub();
  }, [authLoading, t, uid]);

  const rows = useMemo(() => chats, [chats]);

  if (!ready || authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white/35">
        <p className="text-sm font-bold">{t("common_loading")}</p>
      </main>
    );
  }

  if (errorText) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
        <p className="text-sm font-bold text-white/55">{errorText}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-white px-6 py-3 text-sm font-black text-black"
        >
          Recargar
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="border-b border-white/10 py-3 text-lg font-black">{t("chats_title")}</h1>

        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm font-bold text-white/30">{t("chats_empty")}</p>
        ) : (
          <div className="divide-y divide-white/10">
            {rows.map((chat) => {
              const title = chatPeerTitle(chat, uid);
              return (
                <ChatInboxLink
                  key={chat.id}
                  href={chatHref(chat)}
                  className="block px-1 py-4"
                >
                  <p className="truncate text-base font-black text-white">{title}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-white/35">
                    {chat.lastMessage || t("chats_no_messages")}
                  </p>
                </ChatInboxLink>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
