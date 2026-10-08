"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useEffectivePathname } from "@/contexts/MainTabShellContext";

import { useAuth } from "@/contexts/AuthContext";
import { useDocumentHidden } from "@/hooks/useDocumentHidden";
import { useChatsInbox } from "@/hooks/useChatsInbox";
import { globalChatWhipManager } from "@/lib/chat/globalChatWhipManager";
import { chatPeerTitle } from "@/lib/chat/inboxPeerTitle";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import {
  shouldEnableChatNotificationListeners,
  shouldEnableFullInboxListeners,
} from "@/lib/chat/inboxListenerRoutes";
import {
  getLocalChatReadVersion,
  subscribeLocalChatRead,
} from "@/lib/chat/localChatRead";
import {
  resolveInboxViewerId,
  totalUnreadCount,
} from "@/lib/chat/inboxUnread";
import {
  areChatNotificationsEnabled,
  syncChatNotificationPrefsFromBrowserPermission,
  subscribeChatNotificationPrefs,
} from "@/lib/chat/chatNotificationPrefs";
import { initChatNotifications, requestChatNotificationPermission, showChatNotification } from "@/lib/chat/chatNotifications";
import { isOwnChatSender } from "@/lib/chat/incomingChatActivity";
import {
  clearLocalPendingChatsForThread,
  countLocalPendingChats,
  getLocalPendingChatsVersion,
  markLocalPendingChat,
  reconcileLocalPendingChats,
  subscribeLocalPendingChats,
} from "@/lib/chat/localPendingChats";
import { chatUnreadCountForViewer } from "@/lib/chat/inboxUnread";
import { getSessionChatIds, SESSION_CHATS_CHANGED_EVENT } from "@/lib/chat/sessionChats";
import { tryAlertIncomingMessage } from "@/lib/chat/whipAlertDedupe";
import { bindWhipSoundUnlock, playIncomingWhipSound } from "@/lib/chat/whipSound";
import { isCapacitorNative } from "@/lib/app/nativeShell";
import {
  enableWebChatPush,
  hasActiveFcmRegistration,
} from "@/lib/chat/fcmPush";

function subscribeSessionChatIds(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => onStoreChange();
  window.addEventListener(SESSION_CHATS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(SESSION_CHATS_CHANGED_EVENT, handler);
}

function getSessionChatIdsVersion() {
  return getSessionChatIds().join("|");
}

export function useGlobalChatAlerts() {
  const pathname = useEffectivePathname();
  const documentHidden = useDocumentHidden();
  const { firebaseUser } = useAuth();
  const notificationsEnabled = useSyncExternalStore(
    subscribeChatNotificationPrefs,
    areChatNotificationsEnabled,
    () => false,
  );

  const inboxRouteEnabled = useMemo(
    () => shouldEnableFullInboxListeners(pathname),
    [pathname],
  );
  const chatAlertsRouteEnabled = useMemo(
    () => shouldEnableChatNotificationListeners(pathname, notificationsEnabled),
    [pathname, notificationsEnabled],
  );
  // Keep inbox queries on main tabs even when the tab is briefly hidden so the
  // orange chats tick updates without requiring a visit to /chats.
  const liveFirestoreEnabled = inboxRouteEnabled;
  const notificationInboxEnabled =
    notificationsEnabled && chatAlertsRouteEnabled;
  const backgroundNotificationInboxEnabled =
    notificationsEnabled && chatAlertsRouteEnabled;
  // Keep message listeners on main tabs even when the document is hidden so
  // browser banners + orange tick can fire without opening /chats. Do NOT tie
  // this to forceAnonRecovery — that path must stay /chats-only.
  const messageListenersEnabled = chatAlertsRouteEnabled;

  const { sortedChats, displaySortedChats, uid, loading, isAnonymousSession, firestoreSynced } = useChatsInbox({
    enableInboxQueries:
      liveFirestoreEnabled || backgroundNotificationInboxEnabled,
    enableSessionChatListeners:
      messageListenersEnabled || getSessionChatIds().length > 0,
    enableAnonInboxQuery:
      liveFirestoreEnabled ||
      backgroundNotificationInboxEnabled ||
      messageListenersEnabled,
    forceAnonRecovery: pathname === "/chats" && !documentHidden,
  });

  const viewerId = resolveInboxViewerId(uid);
  const firebaseUid = firebaseUser?.uid || uid || "";
  useSyncExternalStore(subscribeLocalChatRead, getLocalChatReadVersion, () => 0);
  useSyncExternalStore(subscribeSessionChatIds, getSessionChatIdsVersion, () => "");
  useSyncExternalStore(subscribeLocalPendingChats, getLocalPendingChatsVersion, () => "0");

  const activeChatId = (() => {
    const match = pathname.match(/\/chat\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  })();

  // Prefer the rows the UI already trusts (snapshot fallback included). Waiting
  // only on live sortedChats hid the orange tick until the user opened /chats.
  const unreadSource =
    sortedChats.length > 0 ? sortedChats : displaySortedChats;
  const unreadHydrated =
    !inboxRouteEnabled ||
    firestoreSynced ||
    unreadSource.length > 0;
  const activeInboxRow = activeChatId
    ? unreadSource.find(
        (row) =>
          row.id === activeChatId || row.canonicalChatId === activeChatId,
      )
    : undefined;
  const inboxUnread = unreadHydrated
    ? totalUnreadCount(unreadSource, firebaseUid, { excludeChatId: activeChatId })
    : 0;
  // Whip marks pending immediately — inbox unreadCounts can lag one snapshot.
  const whipPending = countLocalPendingChats(
    activeChatId,
    activeInboxRow?.id,
    activeInboxRow?.canonicalChatId,
  );
  const totalUnread = Math.max(inboxUnread, whipPending);

  useEffect(() => {
    if (!activeChatId) return;
    clearLocalPendingChatsForThread(
      activeChatId,
      activeInboxRow?.id,
      activeInboxRow?.canonicalChatId,
    );
  }, [activeChatId, activeInboxRow?.id, activeInboxRow?.canonicalChatId]);

  // Inbox unread alone must paint the orange tick on Shuffle/Stories — do not
  // wait for a whip id transition (new threads often arrive as first snapshot).
  // Also drop latched ids once the inbox says they are read (after grace).
  useEffect(() => {
    if (!unreadHydrated || !inboxRouteEnabled) return;
    for (const chat of unreadSource) {
      const chatId = chat.canonicalChatId || chat.id;
      if (!chatId || chatId === activeChatId) continue;
      if (chatUnreadCountForViewer(chat, firebaseUid, { excludeChatId: activeChatId }) > 0) {
        markLocalPendingChat(chatId);
      }
    }
    const byId = new Map<string, (typeof unreadSource)[number]>();
    for (const chat of unreadSource) {
      byId.set(chat.id, chat);
      if (chat.canonicalChatId) byId.set(chat.canonicalChatId, chat);
    }
    reconcileLocalPendingChats((chatId) => {
      if (
        chatId === activeChatId ||
        (activeChatId &&
          (byId.get(chatId)?.id === activeChatId ||
            byId.get(chatId)?.canonicalChatId === activeChatId))
      ) {
        return false;
      }
      const chat = byId.get(chatId);
      if (!chat) return firestoreSynced ? false : null;
      return (
        chatUnreadCountForViewer(chat, firebaseUid, {
          excludeChatId: activeChatId,
        }) > 0
      );
    });
  }, [
    unreadHydrated,
    inboxRouteEnabled,
    unreadSource,
    firebaseUid,
    activeChatId,
    firestoreSynced,
  ]);

  const seenLatestMessageIdsRef = useRef<Map<string, string> | null>(null);
  const inboxAlertSignature = unreadSource
    .map((chat) => `${chat.canonicalChatId || chat.id}:${chat.latestMessageId || ""}`)
    .join("|");

  // Whip only watches 25 threads and can miss the first live snapshot. Inbox
  // latestMessageId transitions still raise the browser banner on Shuffle /
  // Stories without opening /chats. Deduped with the whip path via message id.
  useEffect(() => {
    if (!unreadHydrated || !inboxRouteEnabled || !notificationsEnabled) return;
    const previous = seenLatestMessageIdsRef.current;
    const next = new Map<string, string>();
    for (const chat of unreadSource) {
      const chatId = chat.canonicalChatId || chat.id;
      if (!chatId) continue;
      next.set(chatId, String(chat.latestMessageId || ""));
    }
    seenLatestMessageIdsRef.current = next;
    if (!previous) {
      // First hydration: no indiscriminate historical alerts. Recover only rows
      // that already look like a live unread inbound (whip may have skipped an
      // ambiguous first snapshot without burning the id).
      for (const chat of unreadSource) {
        const chatId = chat.canonicalChatId || chat.id;
        if (!chatId || chatId === activeChatId) continue;
        const latest = String(chat.latestMessageId || "");
        if (!latest) continue;
        if (
          chatUnreadCountForViewer(chat, firebaseUid, {
            excludeChatId: activeChatId,
          }) <= 0
        ) {
          continue;
        }
        const sender = String(chat.lastMessageSender || "");
        if (sender && isOwnChatSender(sender, viewerId, firebaseUid, chat)) {
          continue;
        }
        const arrivedAt = Number(chat.lastMessageAt?.toMillis?.() || 0);
        const ageMs = Date.now() - arrivedAt;
        if (!arrivedAt || ageMs < 0 || ageMs > 2 * 60_000) continue;
        tryAlertIncomingMessage({
          chatId,
          messageId: latest,
          incoming: true,
          suppress: false,
          onAlert: () => {
            markLocalPendingChat(chatId);
            playIncomingWhipSound();
            void showChatNotification({
              title: chatPeerTitle(chat, firebaseUid) || "Nuevo mensaje",
              body: String(chat.lastMessage || "Nuevo mensaje"),
              chatId,
              messageId: latest,
              viewingActiveChat: false,
            });
          },
        });
      }
      return;
    }

    for (const chat of unreadSource) {
      const chatId = chat.canonicalChatId || chat.id;
      if (!chatId) continue;
      const latest = String(chat.latestMessageId || "");
      const prior = previous.get(chatId);
      if (!latest || prior === latest) continue;
      const sender = String(chat.lastMessageSender || "");
      if (sender && isOwnChatSender(sender, viewerId, firebaseUid, chat)) continue;
      const arrivedAt = Number(chat.lastMessageAt?.toMillis?.() || 0);
      if (prior === undefined && arrivedAt > 0 && Date.now() - arrivedAt > 2 * 60_000) {
        continue;
      }
      tryAlertIncomingMessage({
        chatId,
        messageId: latest,
        incoming: true,
        suppress: false,
        onAlert: () => {
          // Inbox can discover a new thread before unreadCounts catch up; latch
          // orange pending here so Shuffle/Stories do not wait for /chats.
          markLocalPendingChat(chatId);
          playIncomingWhipSound();
          void showChatNotification({
            title: chatPeerTitle(chat, firebaseUid) || "Nuevo mensaje",
            body: String(chat.lastMessage || "Nuevo mensaje"),
            chatId,
            messageId: latest,
            viewingActiveChat: false,
          });
        },
      });
    }
  }, [
    unreadHydrated,
    inboxRouteEnabled,
    notificationsEnabled,
    inboxAlertSignature,
    unreadSource,
    activeChatId,
    viewerId,
    firebaseUid,
  ]);

  const pathnameRef = useRef(pathname);
  const sortedChatsRef = useRef(sortedChats);

  pathnameRef.current = pathname;
  sortedChatsRef.current =
    sortedChats.length > 0 ? sortedChats : displaySortedChats;

  useEffect(() => {
    void initChatNotifications();
    return bindWhipSoundUnlock();
  }, []);

  // Chrome permission changes made in site settings do not emit our app's
  // preference event. Reconcile on return so the existing eager-registration
  // effect can create the FCM token without requiring a full reload.
  useEffect(() => {
    const syncGrantedPermission = () => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return;
      }
      syncChatNotificationPrefsFromBrowserPermission();
    };
    window.addEventListener("focus", syncGrantedPermission);
    document.addEventListener("visibilitychange", syncGrantedPermission);
    syncGrantedPermission();
    return () => {
      window.removeEventListener("focus", syncGrantedPermission);
      document.removeEventListener("visibilitychange", syncGrantedPermission);
    };
  }, []);

  // A previously granted browser permission must restore the web push token as
  // soon as auth is ready. Inbox hydration can take several seconds on a cold
  // start; waiting for it leaves a real window where backend delivery sees no
  // token and permanently skips the incoming message.
  useEffect(() => {
    if (
      !notificationsEnabled ||
      !firebaseUser ||
      isCapacitorNative() ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted" ||
      hasActiveFcmRegistration()
    ) {
      return;
    }
    void enableWebChatPush(firebaseUser);
  }, [firebaseUser, notificationsEnabled]);

  // Keep the first-time permission prompt on the established in-app/loading
  // path. The eager effect above only runs for permission already granted.
  useEffect(() => {
    if (!chatAlertsRouteEnabled || loading || !notificationsEnabled) return;
    void requestChatNotificationPermission().then((granted) => {
      if (
        granted &&
        firebaseUser &&
        !isCapacitorNative() &&
        !hasActiveFcmRegistration()
      ) {
        void enableWebChatPush(firebaseUser);
      }
    });
  }, [chatAlertsRouteEnabled, firebaseUser, loading, notificationsEnabled]);

  useEffect(() => {
    globalChatWhipManager.setContext({
      viewerId: viewerId || getChatAnonSenderId(),
      firebaseUid,
      getActiveChatId: () => {
        const match = pathnameRef.current.match(/\/chat\/([^/?#]+)/);
        return match ? decodeURIComponent(match[1]) : "";
      },
      getChatLabel: (chatId) => {
        const chat = sortedChatsRef.current.find(
          (row) => row.id === chatId || row.canonicalChatId === chatId,
        );
        return chat ? chatPeerTitle(chat, firebaseUid) : "Nuevo mensaje";
      },
      getChatById: (chatId) =>
        sortedChatsRef.current.find(
          (row) => row.id === chatId || row.canonicalChatId === chatId,
        ),
    });
  }, [viewerId, firebaseUid, sortedChats]);

  useEffect(() => {
    const sessionActive = getSessionChatIds().length > 0;
    // Never pause/clear whip on auth or inbox `loading` — that reattached
    // listeners, baselined the live inbound, and killed browser notif + tick
    // until the user opened /chats.
    globalChatWhipManager.setPaused(!messageListenersEnabled && !sessionActive);

    if (!chatAlertsRouteEnabled) {
      return;
    }

    if (!messageListenersEnabled && !sessionActive) {
      return;
    }

    globalChatWhipManager.start();
    const inboxRows = sortedChats.length > 0 ? sortedChats : displaySortedChats;
    const inboxIds = inboxRows.map((chat) => chat.canonicalChatId || chat.id);
    globalChatWhipManager.syncInboxChatIds(
      Array.from(new Set([...inboxIds, ...getSessionChatIds()])),
    );
  }, [
    chatAlertsRouteEnabled,
    messageListenersEnabled,
    sortedChats,
    displaySortedChats,
  ]);

  return useMemo(
    () => ({
      totalUnread,
      viewerId,
      sortedChats: displaySortedChats,
      uid,
      loading,
      isAnonymousSession,
      inboxQueriesEnabled: inboxRouteEnabled || notificationInboxEnabled,
      firestoreSynced,
    }),
    [
      totalUnread,
      viewerId,
      displaySortedChats,
      uid,
      loading,
      isAnonymousSession,
      inboxRouteEnabled,
      notificationInboxEnabled,
      firestoreSynced,
    ],
  );
}
