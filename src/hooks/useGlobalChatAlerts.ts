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
  subscribeChatNotificationPrefs,
} from "@/lib/chat/chatNotificationPrefs";
import { initChatNotifications, requestChatNotificationPermission } from "@/lib/chat/chatNotifications";
import {
  clearLocalPendingChat,
  countLocalPendingChats,
  getLocalPendingChatsVersion,
  markLocalPendingChat,
  subscribeLocalPendingChats,
} from "@/lib/chat/localPendingChats";
import { chatUnreadCountForViewer } from "@/lib/chat/inboxUnread";
import { getSessionChatIds, SESSION_CHATS_CHANGED_EVENT } from "@/lib/chat/sessionChats";
import { bindWhipSoundUnlock } from "@/lib/chat/whipSound";

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

  useEffect(() => {
    if (activeChatId) clearLocalPendingChat(activeChatId);
  }, [activeChatId]);

  // Prefer the rows the UI already trusts (snapshot fallback included). Waiting
  // only on live sortedChats hid the orange tick until the user opened /chats.
  const unreadSource =
    sortedChats.length > 0 ? sortedChats : displaySortedChats;
  const unreadHydrated =
    !inboxRouteEnabled ||
    firestoreSynced ||
    unreadSource.length > 0;
  const inboxUnread = unreadHydrated
    ? totalUnreadCount(unreadSource, firebaseUid, { excludeChatId: activeChatId })
    : 0;
  // Whip marks pending immediately — inbox unreadCounts can lag one snapshot.
  const whipPending = countLocalPendingChats(activeChatId);
  const totalUnread = Math.max(inboxUnread, whipPending);

  // Inbox unread alone must paint the orange tick on Shuffle/Stories — do not
  // wait for a whip id transition (new threads often arrive as first snapshot).
  useEffect(() => {
    if (!unreadHydrated || !inboxRouteEnabled) return;
    for (const chat of unreadSource) {
      const chatId = chat.canonicalChatId || chat.id;
      if (!chatId || chatId === activeChatId) continue;
      if (chatUnreadCountForViewer(chat, firebaseUid, { excludeChatId: activeChatId }) > 0) {
        markLocalPendingChat(chatId);
      }
    }
  }, [unreadHydrated, inboxRouteEnabled, unreadSource, firebaseUid, activeChatId]);

  const pathnameRef = useRef(pathname);
  const sortedChatsRef = useRef(sortedChats);

  pathnameRef.current = pathname;
  sortedChatsRef.current =
    sortedChats.length > 0 ? sortedChats : displaySortedChats;

  useEffect(() => {
    void initChatNotifications();
    return bindWhipSoundUnlock();
  }, []);

  useEffect(() => {
    if (!chatAlertsRouteEnabled || loading || !notificationsEnabled) return;
    void requestChatNotificationPermission();
  }, [chatAlertsRouteEnabled, loading, notificationsEnabled]);

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
