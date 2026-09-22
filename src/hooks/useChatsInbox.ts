"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { QuerySnapshot } from "firebase/firestore";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
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
import {
  hasInboxActivity,
  missingPreviewRetryDelayMs,
  preferInboxChat,
  previewFromMessageData,
  shellCreatedAtMs,
  shouldRetryMissingPreview,
} from "@/lib/chat/inboxShellGuard";
import { normalizeInboxChat } from "@/lib/chat/normalizeInboxChat";
import { markChatsInboxHydrated, rememberInboxChatCount } from "@/hooks/useChatsInboxReady";
import { withoutDeletedInboxChats } from "@/lib/chat/deletedInboxChats";
import {
  readInboxSnapshot,
  removeInboxSnapshotChat,
  writeInboxSnapshot,
} from "@/lib/chat/inboxSnapshot";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import { chatsPipelineMark } from "@/lib/perf/chatsPipelineTrace";
import {
  getSessionChatIds,
  registerSessionChat,
  SESSION_CHATS_CHANGED_EVENT,
  SESSION_CHAT_REMOVED_EVENT,
} from "@/lib/chat/sessionChats";
import { fetchRecoveredAnonInboxChats } from "@/lib/chat/anonInboxRecovery";
import {
  hadRecentInterruptedChatSend,
  hasPendingChatSends,
  listPendingChatSendIds,
  waitForPendingChatSends,
} from "@/lib/chat/pendingChatSends";

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
  createdAtMs?: number;
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
  /** Anonymous/visitor inbox recovery for the current Firebase principal. */
  enableAnonInboxQuery?: boolean;
  /** Force one authoritative anon reconciliation when the real /chats inbox is entered. */
  forceAnonRecovery?: boolean;
};

export function useChatsInbox(options?: UseChatsInboxOptions) {
  const enableInboxQueries = options?.enableInboxQueries ?? true;
  const enableSessionChatListeners =
    options?.enableSessionChatListeners ?? enableInboxQueries;
  const enableAnonInboxQuery = options?.enableAnonInboxQuery ?? false;
  const forceAnonRecovery = options?.forceAnonRecovery ?? false;
  const { firebaseUser, loading } = useAuth();
  const [chats, setChats] = useState<InboxChat[]>(() => {
    const snapshot = withoutDeletedInboxChats(readInboxSnapshot());
    if (snapshot.length > 0) rememberInboxChatCount(snapshot.length);
    return snapshot;
  });
  const [sessionChats, setSessionChats] = useState<InboxChat[]>([]);
  const [sessionChatIds, setSessionChatIds] = useState<string[]>([]);
  const [anonSessionId, setAnonSessionId] = useState("");
  const [firestoreSynced, setFirestoreSynced] = useState(false);
  const inboxCohortRef = useRef(createInboxQueryCohortState());
  const forcedAnonRecoveryKeyRef = useRef("");
  const fallbackAnonRecoveryKeyRef = useRef("");
  const missingPreviewAttemptsRef = useRef(new Map<string, number>());
  const missingPreviewTimersRef = useRef(new Map<string, number>());

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
    anonRecovery: new Map(),
  });
  const snapshotBootstrappedRef = useRef(false);
  const lastSortedChatsRef = useRef<InboxChat[]>(withoutDeletedInboxChats(readInboxSnapshot()));
  if (!snapshotBootstrappedRef.current && lastSortedChatsRef.current.length > 0) {
    rememberInboxChatCount(lastSortedChatsRef.current.length);
    snapshotBootstrappedRef.current = true;
  }

  const rebuildChats = () => {
    const merged = new Map<string, InboxChat>();
    for (const map of Object.values(queryMapsRef.current)) {
      for (const [id, chat] of map) {
        merged.set(id, preferInboxChat(merged.get(id), chat));
      }
    }
    setChats([...merged.values()]);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onRemoved = (event: Event) => {
      const chatId = String(
        (event as CustomEvent<{ chatId?: string }>).detail?.chatId || "",
      ).trim();
      if (!chatId) return;

      const matches = (chat: InboxChat) =>
        chat.id === chatId || chat.canonicalChatId === chatId;

      for (const map of Object.values(queryMapsRef.current)) {
        for (const [key, chat] of map) {
          if (key === chatId || matches(chat)) map.delete(key);
        }
      }

      setSessionChats((prev) => prev.filter((chat) => !matches(chat)));
      setChats((prev) => prev.filter((chat) => !matches(chat)));
      lastSortedChatsRef.current = lastSortedChatsRef.current.filter(
        (chat) => !matches(chat),
      );
      removeInboxSnapshotChat(chatId);
    };

    window.addEventListener(SESSION_CHAT_REMOVED_EVENT, onRemoved);
    return () => window.removeEventListener(SESSION_CHAT_REMOVED_EVENT, onRemoved);
  }, []);

  const applyHydratedPreview = (chatId: string, hydrated: InboxChat, key: string) => {
    if (key === "session") {
      setSessionChats((prev) => {
        const existing = prev.find((chat) => chat.id === chatId);
        const rest = prev.filter((chat) => chat.id !== chatId);
        return [...rest, preferInboxChat(existing, hydrated)];
      });
      return;
    }
    const map = queryMapsRef.current[key];
    if (!map) return;
    map.set(chatId, preferInboxChat(map.get(chatId), hydrated));
    rebuildChats();
  };

  const hydrateMissingPreview = async (
    chatId: string,
    normalized: InboxChat,
    key: string,
  ) => {
    if (hasInboxActivity(normalized)) return;
    const attempts = missingPreviewAttemptsRef.current.get(chatId) ?? 0;
    const pendingIds = listPendingChatSendIds();
    const interrupted = hadRecentInterruptedChatSend() || pendingIds.includes(chatId);
    if (
      attempts > 0 &&
      !shouldRetryMissingPreview({
        attempts,
        createdAtMs: shellCreatedAtMs(normalized as unknown as Record<string, unknown>),
        nowMs: Date.now(),
        chatId,
        pendingChatIds: pendingIds,
        interrupted,
      })
    ) {
      return;
    }
    missingPreviewAttemptsRef.current.set(chatId, attempts + 1);
    try {
      const messages = await getDocs(
        query(
          collection(db, "chats", chatId, "mensajes"),
          orderBy("createdAt", "desc"),
          limit(1),
        ),
      );
      const latest = messages.docs[0];
      if (!latest) {
        if (
          shouldRetryMissingPreview({
            attempts: attempts + 1,
            createdAtMs: shellCreatedAtMs(normalized as unknown as Record<string, unknown>),
            nowMs: Date.now(),
            chatId,
            pendingChatIds: listPendingChatSendIds(),
            interrupted: hadRecentInterruptedChatSend(),
          })
        ) {
          const existingTimer = missingPreviewTimersRef.current.get(chatId);
          if (existingTimer) window.clearTimeout(existingTimer);
          const timer = window.setTimeout(() => {
            missingPreviewTimersRef.current.delete(chatId);
            void hydrateMissingPreview(chatId, normalized, key);
          }, missingPreviewRetryDelayMs(attempts));
          missingPreviewTimersRef.current.set(chatId, timer);
        }
        return;
      }
      const message = latest.data() as Record<string, unknown>;
      const preview = previewFromMessageData(message, latest.id);
      const createdAt = preview.createdAt as InboxChat["updatedAt"];
      const hydrated = normalizeInboxChat({
        ...normalized,
        lastMessage: preview.lastMessage,
        lastMessageSender: preview.lastMessageSender,
        latestMessageId: preview.latestMessageId,
        latestSenderKind: preview.latestSenderKind,
        updatedAt: createdAt || normalized.updatedAt,
        lastMessageAt: createdAt || normalized.lastMessageAt,
      });
      if (!hydrated || !hasInboxActivity(hydrated)) return;
      missingPreviewAttemptsRef.current.delete(chatId);
      applyHydratedPreview(chatId, hydrated, key);
    } catch (error) {
      console.error("inbox missing preview", key, chatId, error);
    }
  };

  useEffect(() => {
    if (loading) return;
    const recoveryPrincipal = firebaseUser?.uid || "";
    const next = reduceInboxQueryCohort(inboxCohortRef.current, {
      type: "rotate",
      key: inboxQueryCohortKey({
        uid,
        anonId: recoveryPrincipal,
        uidFamily: Boolean(enableInboxQueries && uid),
        anonFamily: Boolean(enableAnonInboxQuery && recoveryPrincipal),
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
  }, [loading, uid, firebaseUser, enableInboxQueries, enableAnonInboxQuery]);

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
      anon: Boolean(enableAnonInboxQuery && firebaseUser),
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
          if (normalized) {
            map.set(docSnap.id, normalized);
            void hydrateMissingPreview(docSnap.id, normalized, key);
          }
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
      );

      // anonOwnerUid mirrors receptor/target on profile-anon threads, but
      // Firestore list rules intentionally do not authorize queries on that field.
      // Query receptorUid/targetUid instead so the UID cohort can actually reach
      // its first-snapshot synced state without a permanent permission-denied.
      const byReceptor = query(
        collection(db, "chats"),
        where("receptorUid", "==", uid),
      );

      const byTarget = query(
        collection(db, "chats"),
        where("targetUid", "==", uid),
      );

      unsubscribers.push(
        onSnapshot(byParticipantes, mergeQuery("participantes"), (error) => {
          console.error("inbox snapshot listener", "participantes", error);
        }),
        onSnapshot(byReceptor, mergeQuery("receptor"), (error) => {
          console.error("inbox snapshot listener", "receptor", error);
        }),
        onSnapshot(byTarget, mergeQuery("target"), (error) => {
          console.error("inbox snapshot listener", "target", error);
        }),
      );
    };

    registerInboxQueries();
    return () => {
      cancelled = true;
      for (const unsub of unsubscribers) unsub();
    };
  }, [uid, loading, enableInboxQueries, enableAnonInboxQuery, firebaseUser]);

  useEffect(() => {
    if (loading || !enableAnonInboxQuery) return;

    // Leaving the real inbox arms the next /chats entry for a fresh
    // authoritative reconciliation.
    if (!forceAnonRecovery) {
      forcedAnonRecoveryKeyRef.current = "";
    }

    // Recovery is keyed by the persisted Firebase principal plus the current
    // session chat registry. A newly persisted thread changes this key and
    // forces one server reconciliation even if the keep-alive never unmounted.
    const generation = inboxCohortRef.current.generation;
    const inboxFamilies = {
      uid: Boolean(enableInboxQueries && uid),
      anon: Boolean(firebaseUser),
    };

    // Before any Firebase principal exists there cannot be a bound private
    // visitor lease to recover. Mark the anonymous side hydrated so /chats
    // can render its empty state instead of waiting forever.
    if (!firebaseUser) {
      queryMapsRef.current.anonRecovery = new Map();
      // A transient/no-anon-auth state must never authorize replacing a
      // previously visible inbox with empty. Only declare an authoritative
      // empty inbox when there is genuinely nothing local to preserve.
      if (
        !uid &&
        sessionChatIds.length === 0 &&
        lastSortedChatsRef.current.length === 0
      ) {
        setFirestoreSynced(true);
      }
      rebuildChats();
      return;
    }

    const recoveryKey = `${firebaseUser.uid}|${sessionChatIds.join(",")}`;

    if (forceAnonRecovery) {
      if (forcedAnonRecoveryKeyRef.current === recoveryKey) return;
      forcedAnonRecoveryKeyRef.current = recoveryKey;
    } else {
      if (fallbackAnonRecoveryKeyRef.current === recoveryKey) return;
      fallbackAnonRecoveryKeyRef.current = recoveryKey;
    }

    let cancelled = false;
    void (async () => {
      // Entering Chats while a send is still binding/issuing its permit can
      // otherwise snapshot the server-created shell before its first message
      // commit, then incorrectly treat that empty shell as authoritative.
      if (forceAnonRecovery && hasPendingChatSends()) {
        await waitForPendingChatSends();
        if (cancelled) return null;
      }

      const interruptedSend =
        forceAnonRecovery &&
        (hadRecentInterruptedChatSend() || listPendingChatSendIds().length > 0);
      let rows = await fetchRecoveredAnonInboxChats(firebaseUser);

      // A hard navigation / Android WebView recreation destroys in-memory
      // promises. The durable marker tells us a send was interrupted recently;
      // retry only that exceptional case so an empty shell is not mistaken for
      // the final inbox state. Normal inbox opens still make one recovery call.
      if (interruptedSend) {
        for (const delayMs of [250, 650, 1200]) {
          const hasEmptyShell =
            rows.length === 0 ||
            rows.some((row) => !String(row.lastMessage || "").trim());
          if (!hasEmptyShell) break;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          if (cancelled) return null;
          rows = await fetchRecoveredAnonInboxChats(firebaseUser);
        }
      }

      return rows;
    })()
      .then((rows) => {
        if (!rows) return;
        if (cancelled) return;
        const map = new Map<string, InboxChat>();
        for (const row of rows) {
          const normalized = normalizeInboxChat(
            row as InboxChat,
          );
          if (!normalized) continue;
          map.set(normalized.id, normalized);
          // Re-seed volatile per-thread listeners after Android/WebView process
          // recreation. This is intentionally session-only after recovery.
          registerSessionChat(normalized.canonicalChatId || normalized.id);
          if (!hasInboxActivity(normalized)) {
            void hydrateMissingPreview(normalized.id, normalized, "anonRecovery");
          }
        }
        queryMapsRef.current.anonRecovery = map;

        const next = reduceInboxQueryCohort(inboxCohortRef.current, {
          type: "snapshot",
          generation,
          queryKey: "anonRecovery",
          families: inboxFamilies,
        });
        if (!next.ignored) {
          inboxCohortRef.current = next;
          if (next.synced || !uid) setFirestoreSynced(true);
        }
        rebuildChats();
      })
      .catch((error) => {
        if (cancelled) return;
        // Recovery is a fallback; existing sessionChat listeners still own the
        // live happy path. A failed recovery is NOT an authoritative empty
        // snapshot, so keep firestoreSynced false and preserve visible rows.
        console.error("anon inbox recovery", error);
        if (forceAnonRecovery) {
          forcedAnonRecoveryKeyRef.current = "";
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    enableAnonInboxQuery,
    enableInboxQueries,
    firebaseUser,
    forceAnonRecovery,
    loading,
    sessionChatIds,
    uid,
  ]);

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
      onSnapshot(
        doc(db, "chats", chatId),
        (snap) => {
          if (!snap.exists()) {
            if (
              listPendingChatSendIds().includes(chatId) ||
              hadRecentInterruptedChatSend()
            ) {
              return;
            }
            setSessionChats((prev) => prev.filter((c) => c.id !== chatId));
            return;
          }

          const data = snap.data() as Omit<InboxChat, "id">;
          const normalized = normalizeInboxChat({
            id: snap.id,
            ...data,
            createdAtMs: shellCreatedAtMs(data as unknown as Record<string, unknown>),
          });
          setSessionChats((prev) => {
            const existing = prev.find((chat) => chat.id === chatId);
            const next = prev.filter((c) => c.id !== chatId);
            if (!normalized) return next;
            return [...next, preferInboxChat(existing, normalized)];
          });
          if (normalized && !hasInboxActivity(normalized)) {
            void hydrateMissingPreview(chatId, normalized, "session");
          }
        },
        (error) => {
          console.error("session chat snapshot listener", chatId, error);
        },
      ),
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
    } else if (firestoreSynced) {
      lastSortedChatsRef.current = [];
      writeInboxSnapshot([]);
      rememberInboxChatCount(0);
    }
    return next;
  }, [chats, sessionChats, uid, firestoreSynced]);

  const displaySortedChats =
    sortedChats.length > 0 || firestoreSynced
      ? sortedChats
      : withoutDeletedInboxChats(lastSortedChatsRef.current);

  return {
    uid,
    loading,
    sortedChats,
    displaySortedChats,
    isAnonymousSession: !uid && !loading,
    firestoreSynced,
  };
}
