"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { QuerySnapshot } from "firebase/firestore";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { auth, db } from "@/lib/firebase";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { ANON_SESSION_CHANGED_EVENT } from "@/lib/chat/anonSession";
import { usernameHintFromAnonChatId } from "@/lib/chat/anonChatId";
import { inboxPeerDedupeKey } from "@/lib/chat/inboxPeerTitle";
import { hasInboxPreview, isVisibleInboxChat } from "@/lib/chat/inboxVisible";
import { normalizeInboxChat } from "@/lib/chat/normalizeInboxChat";
import { getSessionChatIds, SESSION_CHATS_CHANGED_EVENT } from "@/lib/chat/sessionChats";

export type InboxChat = {
  id: string;
  targetUsername?: string;
  receptorUsername?: string;
  otherUsername?: string;
  targetUid?: string;
  receptorUid?: string;
  anonOwnerUid?: string;
  anonSessionId?: string;
  participantes?: string[];
  targetPhoto?: string;
  lastMessage?: string;
  lastMessageSender?: string;
  readBy?: Record<string, boolean>;
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

/** @deprecated Use chatPeerTitle(chat, viewerUid) for inbox rows. */
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

function dedupeChats(chats: InboxChat[], viewerUid = "") {
  const map = new Map<string, InboxChat>();

  for (const chat of chats) {
    const key = inboxPeerDedupeKey(chat, viewerUid || undefined);
    const existing = map.get(key);
    const chatMs = chat.updatedAt?.toMillis?.() ?? 0;
    const existingMs = existing?.updatedAt?.toMillis?.() ?? 0;
    const mergedPhoto = chat.targetPhoto || existing?.targetPhoto;
    const chatVisible = hasInboxPreview(chat);
    const existingVisible = existing ? hasInboxPreview(existing) : false;

    let winner = chat;
    if (existing) {
      if (chatVisible && !existingVisible) {
        winner = chat;
      } else if (!chatVisible && existingVisible) {
        winner = existing;
      } else if (chatMs >= existingMs) {
        winner = chat;
      } else {
        winner = existing;
      }
    }

    const mergedTargetPhoto = winner.targetPhoto || mergedPhoto;
    map.set(
      key,
      mergedTargetPhoto ? { ...winner, targetPhoto: mergedTargetPhoto } : winner,
    );
  }

  return [...map.values()].sort((a, b) => {
    const av = a.updatedAt?.toMillis?.() ?? 0;
    const bv = b.updatedAt?.toMillis?.() ?? 0;
    return bv - av;
  });
}

export type UseChatsInboxOptions = {
  /** Logged-in user: four Firestore inbox queries. */
  enableInboxQueries?: boolean;
  /** Per-doc listeners for chats opened this browser session (anonymous threads). */
  enableSessionChatListeners?: boolean;
  /** Anonymous visitor: participantes query for the current anon session id. */
  enableAnonInboxQuery?: boolean;
};

export function useChatsInbox(options?: UseChatsInboxOptions) {
  const enableInboxQueries = options?.enableInboxQueries ?? true;
  const enableSessionChatListeners =
    options?.enableSessionChatListeners ?? enableInboxQueries;
  const enableAnonInboxQuery = options?.enableAnonInboxQuery ?? false;
  const { firebaseUser, loading } = useAuth();
  const [chats, setChats] = useState<InboxChat[]>([]);
  const [sessionChats, setSessionChats] = useState<InboxChat[]>([]);
  const [sessionChatIds, setSessionChatIds] = useState<string[]>([]);
  const [anonSessionId, setAnonSessionId] = useState("");

  const uid = firebaseUser?.uid || auth.currentUser?.uid || "";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncAnonSessionId = () => {
      setAnonSessionId(getChatAnonSenderId());
    };

    syncAnonSessionId();
    window.addEventListener(ANON_SESSION_CHANGED_EVENT, syncAnonSessionId);

    return () => {
      window.removeEventListener(ANON_SESSION_CHANGED_EVENT, syncAnonSessionId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncSessionChatIds = () => {
      setSessionChatIds(getSessionChatIds());
    };

    syncSessionChatIds();
    window.addEventListener(SESSION_CHATS_CHANGED_EVENT, syncSessionChatIds);

    return () => {
      window.removeEventListener(SESSION_CHATS_CHANGED_EVENT, syncSessionChatIds);
    };
  }, []);

  const queryMapsRef = useRef<Record<string, Map<string, InboxChat>>>({
    participantes: new Map(),
    anonOwner: new Map(),
    receptor: new Map(),
    target: new Map(),
    anonParticipantes: new Map(),
    anonSession: new Map(),
  });

  const rebuildChats = () => {
    const merged = new Map<string, InboxChat>();
    for (const map of Object.values(queryMapsRef.current)) {
      for (const [id, chat] of map) {
        merged.set(id, chat);
      }
    }
    setChats([...merged.values()]);
  };

  useEffect(() => {
    if (loading) return;

    if (!enableInboxQueries || !uid) {
      return;
    }

    queryMapsRef.current.participantes = new Map();
    queryMapsRef.current.anonOwner = new Map();
    queryMapsRef.current.receptor = new Map();
    queryMapsRef.current.target = new Map();
    rebuildChats();

    const mergeQuery = (key: string) => (snap: QuerySnapshot) => {
      const map = new Map<string, InboxChat>();
      for (const docSnap of snap.docs) {
        const normalized = normalizeInboxChat({
          id: docSnap.id,
          ...(docSnap.data() as Omit<InboxChat, "id">),
        });
        if (normalized) map.set(docSnap.id, normalized);
      }
      queryMapsRef.current[key] = map;
      rebuildChats();
    };

    const byParticipantes = query(
      collection(db, "chats"),
      where("participantes", "array-contains", uid),
      limit(50),
    );

    const byOwner = query(
      collection(db, "chats"),
      where("anonOwnerUid", "==", uid),
      limit(50),
    );

    const byReceptor = query(
      collection(db, "chats"),
      where("receptorUid", "==", uid),
      limit(50),
    );

    const byTarget = query(
      collection(db, "chats"),
      where("targetUid", "==", uid),
      limit(50),
    );

    const unsubA = onSnapshot(byParticipantes, mergeQuery("participantes"), (error) => {
      console.error(error);
    });
    const unsubB = onSnapshot(byOwner, mergeQuery("anonOwner"), (error) => {
      console.error(error);
    });
    const unsubC = onSnapshot(byReceptor, mergeQuery("receptor"), (error) => {
      console.error(error);
    });
    const unsubD = onSnapshot(byTarget, mergeQuery("target"), (error) => {
      console.error(error);
    });

    return () => {
      unsubA();
      unsubB();
      unsubC();
      unsubD();
      queryMapsRef.current.participantes = new Map();
      queryMapsRef.current.anonOwner = new Map();
      queryMapsRef.current.receptor = new Map();
      queryMapsRef.current.target = new Map();
      rebuildChats();
    };
  }, [uid, loading, enableInboxQueries]);

  useEffect(() => {
    if (loading) return;
    if (!enableAnonInboxQuery) return;

    const anonId = anonSessionId || getChatAnonSenderId();
    if (!anonId.startsWith("anon_")) return;

    queryMapsRef.current.anonParticipantes = new Map();
    queryMapsRef.current.anonSession = new Map();
    rebuildChats();

    const mergeAnonQuery = (key: string) => (snap: QuerySnapshot) => {
      const map = new Map<string, InboxChat>();
      for (const docSnap of snap.docs) {
        const normalized = normalizeInboxChat({
          id: docSnap.id,
          ...(docSnap.data() as Omit<InboxChat, "id">),
        });
        if (normalized) map.set(docSnap.id, normalized);
      }
      queryMapsRef.current[key] = map;
      rebuildChats();
    };

    const byAnonParticipantes = query(
      collection(db, "chats"),
      where("participantes", "array-contains", anonId),
      limit(50),
    );

    const byAnonSession = query(
      collection(db, "chats"),
      where("anonSessionId", "==", anonId),
      limit(50),
    );

    const unsubA = onSnapshot(
      byAnonParticipantes,
      mergeAnonQuery("anonParticipantes"),
      (error) => {
        console.error(error);
      },
    );
    const unsubB = onSnapshot(
      byAnonSession,
      mergeAnonQuery("anonSession"),
      (error) => {
        console.error(error);
      },
    );

    return () => {
      unsubA();
      unsubB();
      queryMapsRef.current.anonParticipantes = new Map();
      queryMapsRef.current.anonSession = new Map();
      rebuildChats();
    };
  }, [enableAnonInboxQuery, loading, anonSessionId]);

  useEffect(() => {
    if (loading) return;

    if (!enableSessionChatListeners) {
      return;
    }

    if (sessionChatIds.length === 0) {
      setSessionChats([]);
      return;
    }

    const unsubs = sessionChatIds.map((chatId) =>
      onSnapshot(doc(db, "chats", chatId), (snap) => {
        if (!snap.exists()) {
          setSessionChats((prev) => prev.filter((c) => c.id !== chatId));
          return;
        }

        const normalized = normalizeInboxChat({
          id: snap.id,
          ...(snap.data() as Omit<InboxChat, "id">),
        });
        setSessionChats((prev) => {
          const next = prev.filter((c) => c.id !== chatId);
          if (!normalized) return next;
          return [...next, normalized];
        });
      }),
    );

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [enableSessionChatListeners, loading, sessionChatIds]);

  const sortedChats = useMemo(() => {
    return dedupeChats([...chats, ...sessionChats], uid).filter(isVisibleInboxChat);
  }, [chats, sessionChats, uid]);

  return {
    uid,
    loading,
    sortedChats,
    isAnonymousSession: !uid && !loading,
  };
}
