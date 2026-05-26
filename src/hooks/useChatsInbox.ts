"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { auth, db } from "@/lib/firebase";
import { inboxDedupeKey, isProfileAnonChatId } from "@/lib/chat/anonChatId";
import {
  buildLegacyProfileChatIds,
  buildProfileAnonChatId,
} from "@/lib/chat/anonChatId";
import { migrateToCanonicalChat } from "@/lib/chat/migrate";
import { getSessionChatIds } from "@/lib/chat/sessionChats";

export type InboxChat = {
  id: string;
  targetUsername?: string;
  receptorUsername?: string;
  otherUsername?: string;
  lastMessage?: string;
  updatedAt?: { toMillis?: () => number };
  unreadCounts?: Record<string, number>;
  canonicalChatId?: string;
};

export function chatTitle(chat: InboxChat) {
  return chat.targetUsername || chat.receptorUsername || chat.otherUsername || "Chat anónimo";
}

export function chatHref(chat: InboxChat) {
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

export function useChatsInbox() {
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
          return [...next, { id: snap.id, ...data }];
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

    if (chats.length > 0) migrateInbox();

    return () => {
      cancelled = true;
    };
  }, [chats, uid, loading]);

  const sortedChats = useMemo(() => {
    if (uid) return dedupeChats(chats);
    return dedupeChats(sessionChats);
  }, [chats, sessionChats, uid]);

  return {
    uid,
    loading,
    sortedChats,
    isAnonymousSession: !uid && !loading,
  };
}
