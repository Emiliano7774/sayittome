"use client";

import {
  collection,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";

import { isIncomingMessageFromDoc } from "@/lib/chat/incomingChatActivity";
import {
  getSessionChatIds,
  SESSION_CHATS_CHANGED_EVENT,
} from "@/lib/chat/sessionChats";
import { tryAlertIncomingMessage } from "@/lib/chat/whipAlertDedupe";
import { showChatNotification } from "@/lib/chat/chatNotifications";
import { playIncomingWhipSound } from "@/lib/chat/whipSound";
import { db } from "@/lib/firebase";

type WhipContext = {
  viewerId: string;
  firebaseUid: string;
  getActiveChatId: () => string;
  getChatLabel: (chatId: string) => string;
};

function sameIdSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

const MAX_WHIP_CHAT_LISTENERS = 25;

class GlobalChatWhipManager {
  private context: WhipContext | null = null;
  private inboxIds = new Set<string>();
  private sessionIds = new Set<string>();
  private messageUnsubs = new Map<string, Unsubscribe>();
  private lastMessageId = new Map<string, string>();
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
        };

        const body = String(data.text || data.texto || "").trim();
        const incoming = isIncomingMessageFromDoc(
          data,
          ctx.viewerId,
          ctx.firebaseUid,
        );
        const activeChatId = ctx.getActiveChatId();
        const viewingActiveChat = activeChatId === chatId && !document.hidden;
        const isNewMessage = Boolean(previousId && previousId !== messageId);

        this.lastMessageId.set(chatId, messageId);

        if (!isNewMessage) {
          tryAlertIncomingMessage({
            chatId,
            messageId,
            incoming: false,
            suppress: true,
            onAlert: () => undefined,
          });
          return;
        }

        tryAlertIncomingMessage({
          chatId,
          messageId,
          incoming,
          suppress: viewingActiveChat,
          onAlert: () => {
            if (!viewingActiveChat) {
              playIncomingWhipSound();
            }
            void showChatNotification({
              title: ctx.getChatLabel(chatId) || "Nuevo mensaje",
              body,
              chatId,
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
  }
}

export const globalChatWhipManager = new GlobalChatWhipManager();
