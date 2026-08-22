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
import { profileAuthUid } from "@/lib/chat/profileAnonMessageAuthor";
import { dedupeInboxChats, mergeVisibleInboxThreads } from "@/lib/chat/inboxPeerTitle";
import {
  createInboxQueryCohortState,
  inboxQueryCohortKey,
  reduceInboxQueryCohort,
} from "@/lib/chat/inboxQueryCohort";
import { isVisibleInboxChat } from "@/lib/chat/inboxVisible";
import { normalizeInboxChat } from "@/lib/chat/normalizeInboxChat";
import { markChatsInboxHydrated, rememberInboxChatCount } from "@/hooks/useChatsInboxReady";
import { readInboxSnapshot, writeInboxSnapshot } from "@/lib/chat/inboxSnapshot";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import { chatsPipelineMark } from "@/lib/perf/chatsPipelineTrace";
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
  latestMessageId?: string;
  latestSenderKind?: string;
  latestSenderAnonSessionId?: string;
  latestReadMessageId?: string;
  latestReadMessageIds?: Record<string, string>;
  lastMessageAt?: { toMillis?: () => number };
  readBy?: Record<string, boolean>;
  readAt?: Record<string, unknown>;
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

export { dedupeInboxChats as dedupeChats, mergeVisibleInboxThreads };

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
  const [chats, setChats] = useState<InboxChat[]>(() => {
    const snapshot = readInboxSnapshot();
    if (snapshot.length > 0) rememberInboxChatCount(snapshot.length);
    return snapshot;
  });
  const [sessionChats, setSessionChats] = useState<InboxChat[]>([]);
  const [sessionChatIds, setSessionChatIds] = useState<string[]>([]);
  const [anonSessionId, setAnonSessionId] = useState("");
  const [firestoreSynced, setFirestoreSynced] = useState(false);
  const inboxCohortRef = useRef(createInboxQueryCohortState());

  const uid = profileAuthUid(firebaseUser) || profileAuthUid(auth.currentUser);

  useEffect(() => {
    if (loading || !isNavTraceEnabled()) return;
    if (uid) {
      chatsPipelineMark("auth-ready", { authUid: uid });
    } else {
      chatsPipelineMark("auth-unknown");
    }
  }, [loading, uid]);

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
    if (getSessionChatIds().length > 0) {
      markChatsInboxHydrated(1);
    }
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
  const snapshotBootstrappedRef = useRef(false);
  const lastSortedChatsRef = useRef<InboxChat[]>(readInboxSnapshot());
  if (!snapshotBootstrappedRef.current && lastSortedChatsRef.current.length > 0) {
    rememberInboxChatCount(lastSortedChatsRef.current.length);
    snapshotBootstrappedRef.current = true;
  }

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
    const anonId = anonSessionId || getChatAnonSenderId();
    const next = reduceInboxQueryCohort(inboxCohortRef.current, {
      type: "rotate",
      key: inboxQueryCohortKey({
        uid,
        anonId,
        uidFamily: Boolean(enableInboxQueries && uid),
        anonFamily: Boolean(enableAnonInboxQuery && anonId.startsWith("anon_")),
      }),
    });
    if (
      next.generation === inboxCohortRef.current.generation &&
      next.cohortKey === inboxCohortRef.current.cohortKey
    ) {
      return;
    }
    inboxCohortRef.current = next;
    for (const key of next.mapsToClear) {
      queryMapsRef.current[key] = new Map();
    }
    setFirestoreSynced(false);
    if (next.uidChanged) {
      lastSortedChatsRef.current = [];
      setChats([]);
    }
  }, [loading, uid, anonSessionId, enableInboxQueries, enableAnonInboxQuery]);

  useEffect(() => {
    if (loading) return;

    if (!enableInboxQueries || !uid) {
      return;
    }

    const generation = inboxCohortRef.current.generation;
    let cancelled = false;
    const unsubscribers: Array<() => void> = [];
    const inboxFamilies = {
      uid: true,
      anon: Boolean(
        enableAnonInboxQuery &&
          (anonSessionId || getChatAnonSenderId()).startsWith("anon_"),
      ),
    };

    const registerInboxQueries = () => {
      if (cancelled) return;

      const mergeQuery = (key: string) => (snap: QuerySnapshot) => {
        if (cancelled) return;
        const next = reduceInboxQueryCohort(inboxCohortRef.current, {
          type: "snapshot",
          generation,
          queryKey: key,
          families: inboxFamilies,
        });
        if (next.ignored) return;
        inboxCohortRef.current = next;
        if (next.synced) {
          setFirestoreSynced(true);
          if (isNavTraceEnabled()) {
            chatsPipelineMark("firestore-first-callback", { firestoreDocs: snap.docs.length });
          }
        }

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
        if (isNavTraceEnabled()) {
          chatsPipelineMark("inbox-state-set");
        }
      };

      if (isNavTraceEnabled()) {
        chatsPipelineMark("onsnapshot-registered");
      }

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

      unsubscribers.push(
        onSnapshot(byParticipantes, mergeQuery("participantes"), (error) => {
          console.error(error);
        }),
        onSnapshot(byOwner, mergeQuery("anonOwner"), (error) => {
          console.error(error);
        }),
        onSnapshot(byReceptor, mergeQuery("receptor"), (error) => {
          console.error(error);
        }),
        onSnapshot(byTarget, mergeQuery("target"), (error) => {
          console.error(error);
        }),
      );
    };

    registerInboxQueries();
    return () => {
      cancelled = true;
      for (const unsub of unsubscribers) unsub();
    };
  }, [uid, loading, enableInboxQueries, enableAnonInboxQuery, anonSessionId]);

  useEffect(() => {
    if (loading) return;
    if (!enableAnonInboxQuery) return;

    const anonId = anonSessionId || getChatAnonSenderId();
    if (!anonId.startsWith("anon_")) return;

    const generation = inboxCohortRef.current.generation;
    const inboxFamilies = {
      uid: Boolean(enableInboxQueries && uid),
      anon: true,
    };

    const mergeAnonQuery = (key: string) => (snap: QuerySnapshot) => {
      const next = reduceInboxQueryCohort(inboxCohortRef.current, {
        type: "snapshot",
        generation,
        queryKey: key,
        families: inboxFamilies,
      });
      if (next.ignored) return;
      inboxCohortRef.current = next;
      if (next.synced) {
        setFirestoreSynced(true);
      }
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
    };
  }, [enableAnonInboxQuery, enableInboxQueries, loading, anonSessionId, uid]);

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
    const sortStart = performance.now();
    const live = dedupeInboxChats([...chats, ...sessionChats], uid).filter(isVisibleInboxChat);
    const previous = lastSortedChatsRef.current;
    const next = mergeVisibleInboxThreads(previous, live, uid, firestoreSynced);
    const sortMs = Math.round(performance.now() - sortStart);
    if (isNavTraceEnabled() && next.length > 0) {
      chatsPipelineMark("inbox-sort-done", { sortMs, inboxCount: next.length });
    }
    if (next.length > 0) {
      lastSortedChatsRef.current = next;
      writeInboxSnapshot(next);
      rememberInboxChatCount(next.length);
    }
    return next;
  }, [chats, sessionChats, uid, firestoreSynced]);

  const displaySortedChats =
    sortedChats.length > 0 ? sortedChats : lastSortedChatsRef.current;

  return {
    uid,
    loading,
    sortedChats,
    displaySortedChats,
    isAnonymousSession: !uid && !loading,
    firestoreSynced,
  };
}
