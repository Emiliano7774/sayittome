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
import {
  buildLegacyProfileChatIds,
  buildProfileAnonChatId,
  inboxDedupeKey,
  isProfileAnonChatId,
  usernameHintFromAnonChatId,
} from "@/lib/chat/anonChatId";
import { migrateToCanonicalChat } from "@/lib/chat/migrate";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
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

export function resolveChatUsername(chat: InboxChat) {
  const id = chat.canonicalChatId || chat.id;
  return (
    chat.targetUsername ||
    chat.receptorUsername ||
    chat.otherUsername ||
    usernameHintFromAnonChatId(id) ||
    ""
  );
}

export function chatTitle(chat: InboxChat) {
  return resolveChatUsername(chat) || "Chat anónimo";
}

export function chatHref(chat: InboxChat) {
  const id = chat.canonicalChatId || chat.id;
  const username = resolveChatUsername(chat);

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

    setChats([]);

    const byParticipantes = query(
      collection(db, "chats"),
      where("participantes", "array-contains", uid),
    );

    const byOwner = query(
      collection(db, "chats"),
      where("anonOwnerUid", "==", uid),
    );

    const merge = (snap: { docs: { id: string; data: () => unknown }[] }) => {
      setChats((prev) => {
        const map = new Map<string, InboxChat>();
        for (const item of prev) map.set(item.id, item);
        for (const d of snap.docs) {
          map.set(d.id, {
            id: d.id,
            ...(d.data() as Omit<InboxChat, "id">),
          });
        }
        return [...map.values()];
      });
    };

    const unsubA = onSnapshot(byParticipantes, merge, (error) => {
      console.error(error);
    });
    const unsubB = onSnapshot(byOwner, merge, (error) => {
      console.error(error);
    });

    return () => {
      unsubA();
      unsubB();
    };
  }, [uid, loading]);

  useEffect(() => {
    if (loading) return;

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
  }, [loading]);

  useEffect(() => {
    if (loading) return;

    let cancelled = false;

    async function migrateInbox() {
      const anonSenderId = getChatAnonSenderId();
      const all = [...chats, ...sessionChats];

      for (const chat of all) {
        if (cancelled) return;

        const username = chat.targetUsername || chat.receptorUsername;
        if (!username || !isProfileAnonChatId(chat.id)) continue;

        const canonicalId = buildProfileAnonChatId(anonSenderId, username);
        if (chat.id === canonicalId) continue;

        const legacyIds = [
          ...buildLegacyProfileChatIds(anonSenderId, username),
          ...(uid ? buildLegacyProfileChatIds(uid, username) : []),
          chat.id,
        ];

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

    if (chats.length > 0 || sessionChats.length > 0) migrateInbox();

    return () => {
      cancelled = true;
    };
  }, [chats, sessionChats, uid, loading]);

  const sortedChats = useMemo(() => {
    return dedupeChats([...chats, ...sessionChats]);
  }, [chats, sessionChats]);

  return {
    uid,
    loading,
    sortedChats,
    isAnonymousSession: !uid && !loading,
  };
}
