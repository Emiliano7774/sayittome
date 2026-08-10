"use client";

import {
  collection,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";

import type { InboxChat } from "@/hooks/useChatsInbox";
import { isIncomingMessageFromDoc } from "@/lib/chat/incomingChatActivity";
import { resolveChatViewerId } from "@/lib/chat/inboxPeerTitle";
import {
  getSessionChatIds,
  SESSION_CHATS_CHANGED_EVENT,
} from "@/lib/chat/sessionChats";
import { tryAlertIncomingMessage } from "@/lib/chat/whipAlertDedupe";
import { showChatNotification } from "@/lib/chat/chatNotifications";
import { playIncomingWhipSound } from "@/lib/chat/whipSound";
import { db } from "@/lib/firebase";
import { recordQaCriticalEvent } from "@/lib/qa/realDeviceQaDebug";

type WhipContext = {
  viewerId: string;
  firebaseUid: string;
  getActiveChatId: () => string;
  getChatLabel: (chatId: string) => string;
  getChatById: (chatId: string) => InboxChat | undefined;
};

function sameIdSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

const MAX_WHIP_CHAT_LISTENERS = 25;

function messageCreatedAtMs(data: {
  createdAt?: { toMillis?: () => number; seconds?: number };
}): number {
  const createdAt = data.createdAt;
  if (!createdAt) return 0;
  if (typeof createdAt.toMillis === "function") {
    const ms = createdAt.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof createdAt.seconds === "number") {
    return createdAt.seconds * 1000;
  }
  return 0;
}

class GlobalChatWhipManager {
  private context: WhipContext | null = null;
  private inboxIds = new Set<string>();
  private sessionIds = new Set<string>();
  private messageUnsubs = new Map<string, Unsubscribe>();
  private lastMessageId = new Map<string, string>();
  private listenerAttachedAt = new Map<string, number>();
  private bootstrapped = false;
  private sessionListenerAttached = false;
  private paused = false;

  setContext(context: WhipContext) {
    this.context = context;
  }

  start() {
    if (typeof window === "undefined" || this.bootstrapped) return;
    this.bootstrapped = true;
    this.attachSessionListener();
    this.refreshSessionIds();
  }

  stop() {
    this.bootstrapped = false;
    this.paused = false;
    this.detachSessionListener();
    this.clearMessageListeners();
    this.inboxIds.clear();
    this.sessionIds.clear();
    this.lastMessageId.clear();
  }

  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      this.clearMessageListeners();
      return;
    }
    this.rebuildMessageListeners();
  }

  /** Reuse inbox chat ids from useChatsInbox instead of duplicating Firestore listeners. */
  syncInboxChatIds(chatIds: string[]) {
    const next = new Set(chatIds.filter(Boolean));
    if (sameIdSet(next, this.inboxIds)) return;
    this.inboxIds = next;
    this.rebuildMessageListeners();
  }

  private attachSessionListener() {
    if (this.sessionListenerAttached || typeof window === "undefined") return;
    this.sessionListenerAttached = true;
    window.addEventListener(SESSION_CHATS_CHANGED_EVENT, this.handleSessionChange);
  }

  private detachSessionListener() {
    if (!this.sessionListenerAttached || typeof window === "undefined") return;
    window.removeEventListener(SESSION_CHATS_CHANGED_EVENT, this.handleSessionChange);
    this.sessionListenerAttached = false;
  }

  private handleSessionChange = () => {
    this.refreshSessionIds();
  };

  refresh() {
    this.refreshSessionIds();
  }

  private refreshSessionIds() {
    this.sessionIds = new Set(getSessionChatIds());
    this.rebuildMessageListeners();
  }

  private watchedChatIds() {
    return new Set([...this.inboxIds, ...this.sessionIds]);
  }

  private rebuildMessageListeners() {
    if (this.paused) return;

    const nextIds = [...this.watchedChatIds()].slice(0, MAX_WHIP_CHAT_LISTENERS);
    const nextSet = new Set(nextIds);

    for (const [chatId, unsub] of this.messageUnsubs) {
      if (!nextSet.has(chatId)) {
        unsub();
        this.messageUnsubs.delete(chatId);
      }
    }

    for (const chatId of nextSet) {
      if (this.messageUnsubs.has(chatId)) continue;
      this.listenerAttachedAt.set(chatId, Date.now());
      this.messageUnsubs.set(chatId, this.attachMessageListener(chatId));
    }
  }

  private attachMessageListener(chatId: string) {
    const q = query(
      collection(db, "chats", chatId, "mensajes"),
      orderBy("createdAt", "asc"),
      limitToLast(1),
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const ctx = this.context;
        if (!ctx?.viewerId) return;

        const docSnap = snapshot.docs[snapshot.docs.length - 1];
        if (!docSnap) return;

        const messageId = docSnap.id;
        const previousId = this.lastMessageId.get(chatId);
        const data = docSnap.data() as {
          fromUid?: string;
          ownerId?: string;
          senderUid?: string;
          senderKind?: string;
          text?: string;
          texto?: string;
          mediaUrl?: string;
          type?: string;
          createdAt?: { toMillis?: () => number; seconds?: number };
        };

        const textBody = String(data.text || data.texto || "").trim();
        const body =
          textBody || (data.mediaUrl || data.type ? "Nuevo mensaje" : "");
        const chat = ctx.getChatById(chatId);
        const viewerId = chat
          ? resolveChatViewerId(chat, ctx.firebaseUid)
          : ctx.viewerId;
        const incoming = isIncomingMessageFromDoc(
          data,
          viewerId,
          ctx.firebaseUid,
          chat,
        );
        const activeChatId = ctx.getActiveChatId();
        const viewingActiveChat = activeChatId === chatId && !document.hidden;
        const isNewMessage = Boolean(previousId && previousId !== messageId);
        // First snapshot after attaching a listener used to always suppress sound.
        // Profile←anon fails that path (chat just entered the watch set); anon←profile
        // already had previousId from the visitor's outgoing message. Treat a fresh
        // inbound created around attach time as live — never hydrate-old.
        //
        // Manual post-771a927: first inbound often arrives with pending
        // serverTimestamp (createdAtMs===0) and inbox unreadHint not yet visible.
        // That used to suppress + burn dedupe, so the first whip never played.
        const attachedAt = this.listenerAttachedAt.get(chatId) || Date.now();
        const createdAtMs = messageCreatedAtMs(data);
        const unreadHint = (() => {
          if (!chat) return false;
          const readBy = chat.readBy || {};
          const counts = chat.unreadCounts || {};
          const keys = new Set<string>([viewerId, ctx.viewerId, ctx.firebaseUid].filter(Boolean));
          for (const id of keys) {
            if (Number(counts[id] || 0) > 0) return true;
            if (readBy[id] === false) return true;
          }
          return Object.values(counts).some((n) => Number(n || 0) > 0);
        })();
        const LIVE_ATTACH_WINDOW_MS = 8_000;
        const pendingServerTimestamp = createdAtMs === 0;
        const createdNearAttach =
          createdAtMs > 0 && createdAtMs >= attachedAt - LIVE_ATTACH_WINDOW_MS;
        const liveInboundOnAttach =
          !previousId &&
          incoming &&
          !viewingActiveChat &&
          (createdNearAttach || pendingServerTimestamp || unreadHint);

        this.lastMessageId.set(chatId, messageId);

        if (!isNewMessage && !liveInboundOnAttach) {
          // Only burn dedupe for clearly-old hydration. Pending createdAt on a
          // non-live first snapshot must not permanently silence that messageId.
          const clearlyOldHydration =
            createdAtMs > 0 && createdAtMs < attachedAt - LIVE_ATTACH_WINDOW_MS;
          if (clearlyOldHydration || !incoming) {
            tryAlertIncomingMessage({
              chatId,
              messageId,
              incoming: false,
              suppress: true,
              onAlert: () => undefined,
            });
          }
          return;
        }

        tryAlertIncomingMessage({
          chatId,
          messageId,
          incoming,
          suppress: viewingActiveChat,
          onAlert: () => {
            if (!viewingActiveChat) {
              recordQaCriticalEvent("chat", "CHAT_INBOUND_WHIP_TRIGGERED", {
                threadId: chatId,
                messageId,
                soundTriggeredAt: Date.now(),
                owner: "global-listener",
              });
              playIncomingWhipSound();
            }
            void showChatNotification({
              title: ctx.getChatLabel(chatId) || "Nuevo mensaje",
              body,
              chatId,
              viewingActiveChat,
            });
          },
        });
      },
      (error) => {
        console.error("whip message listener", chatId, error);
      },
    );
  }

  private clearMessageListeners() {
    for (const unsub of this.messageUnsubs.values()) {
      unsub();
    }
    this.messageUnsubs.clear();
    this.listenerAttachedAt.clear();
  }
}

export const globalChatWhipManager = new GlobalChatWhipManager();
