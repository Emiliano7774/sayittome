"use client";

import {
  collection,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";

import { isIncomingMessageFromDoc } from "@/lib/chat/incomingChatActivity";
import {
  getSessionChatIds,
  SESSION_CHATS_CHANGED_EVENT,
} from "@/lib/chat/sessionChats";
import { tryAlertIncomingMessage } from "@/lib/chat/whipAlertDedupe";
import {
  notifyIncomingChatMessage,
  playIncomingWhipSound,
} from "@/lib/chat/whipSound";
import { db } from "@/lib/firebase";

type WhipContext = {
  viewerId: string;
  firebaseUid: string;
  getActiveChatId: () => string;
  getChatLabel: (chatId: string) => string;
};

class GlobalChatWhipManager {
  private context: WhipContext | null = null;
  private inboxIds = new Set<string>();
  private sessionIds = new Set<string>();
  private inboxMaps = new Map<string, Map<string, string>>();
  private messageUnsubs = new Map<string, Unsubscribe>();
  private inboxUnsubs: Unsubscribe[] = [];
  private lastMessageId = new Map<string, string>();
  private bootstrapped = false;
  private sessionListenerAttached = false;

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
    this.detachSessionListener();
    this.clearInboxListeners();
    this.clearMessageListeners();
    this.inboxIds.clear();
    this.sessionIds.clear();
    this.lastMessageId.clear();
  }

  syncInboxForUid(uid: string) {
    this.clearInboxListeners();
    this.inboxMaps.clear();
    if (!uid) {
      this.rebuildMessageListeners();
      return;
    }

    const mergeQuery = (key: string) => (snap: { docs: Array<{ id: string }> }) => {
      const map = new Map<string, string>();
      for (const docSnap of snap.docs) {
        map.set(docSnap.id, docSnap.id);
      }
      this.inboxMaps.set(key, map);
      this.rebuildInboxIdsFromMaps();
    };

    const queries = [
      query(collection(db, "chats"), where("participantes", "array-contains", uid)),
      query(collection(db, "chats"), where("anonOwnerUid", "==", uid)),
      query(collection(db, "chats"), where("receptorUid", "==", uid)),
      query(collection(db, "chats"), where("targetUid", "==", uid)),
    ];

    const keys = ["participantes", "anonOwner", "receptor", "target"];
    this.inboxUnsubs = queries.map((q, index) =>
      onSnapshot(
        q,
        mergeQuery(keys[index]),
        (error) => console.error("whip inbox listener", error),
      ),
    );
  }

  private rebuildInboxIdsFromMaps() {
    const merged = new Set<string>();
    for (const map of this.inboxMaps.values()) {
      for (const chatId of map.keys()) {
        merged.add(chatId);
      }
    }
    this.inboxIds = merged;
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
    const nextIds = this.watchedChatIds();

    for (const [chatId, unsub] of this.messageUnsubs) {
      if (!nextIds.has(chatId)) {
        unsub();
        this.messageUnsubs.delete(chatId);
      }
    }

    for (const chatId of nextIds) {
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
        const suppress = activeChatId === chatId && !document.hidden;
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
          suppress,
          onAlert: () => {
            playIncomingWhipSound();
            notifyIncomingChatMessage({
              title: ctx.getChatLabel(chatId) || "Nuevo mensaje",
              body,
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

  private clearInboxListeners() {
    for (const unsub of this.inboxUnsubs) {
      unsub();
    }
    this.inboxUnsubs = [];
    this.inboxIds.clear();
  }
}

export const globalChatWhipManager = new GlobalChatWhipManager();
