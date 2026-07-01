"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

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
import { bindWhipSoundUnlock } from "@/lib/chat/whipSound";

export function useGlobalChatAlerts() {
  const pathname = usePathname();
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
  const liveFirestoreEnabled = inboxRouteEnabled && !documentHidden;
  const notificationInboxEnabled =
    notificationsEnabled && chatAlertsRouteEnabled && !documentHidden;
  const backgroundNotificationInboxEnabled =
    notificationsEnabled && chatAlertsRouteEnabled;
  const messageListenersEnabled =
    chatAlertsRouteEnabled && (!documentHidden || notificationsEnabled);

  const { sortedChats, uid, loading, isAnonymousSession } = useChatsInbox({
    enableInboxQueries:
      liveFirestoreEnabled || backgroundNotificationInboxEnabled,
    enableSessionChatListeners: messageListenersEnabled,
    enableAnonInboxQuery: messageListenersEnabled,
  });

  const viewerId = resolveInboxViewerId(uid);
  const firebaseUid = firebaseUser?.uid || uid || "";
  useSyncExternalStore(subscribeLocalChatRead, getLocalChatReadVersion, () => 0);

  const activeChatId = (() => {
    const match = pathname.match(/\/chat\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  })();

  const totalUnread = totalUnreadCount(sortedChats, firebaseUid, {
    excludeChatId: activeChatId,
  });

  const pathnameRef = useRef(pathname);
  const sortedChatsRef = useRef(sortedChats);

  pathnameRef.current = pathname;
  sortedChatsRef.current = sortedChats;

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
    });
  }, [viewerId, firebaseUid]);

  useEffect(() => {
    globalChatWhipManager.setPaused(!messageListenersEnabled || loading);

    if (loading || !chatAlertsRouteEnabled) {
      globalChatWhipManager.syncInboxChatIds([]);
      return;
    }

    if (!messageListenersEnabled) {
      return;
    }

    globalChatWhipManager.start();
    globalChatWhipManager.syncInboxChatIds(
      sortedChats.map((chat) => chat.canonicalChatId || chat.id),
    );
  }, [chatAlertsRouteEnabled, messageListenersEnabled, loading, sortedChats]);

  return {
    totalUnread,
    viewerId,
    sortedChats,
    uid,
    loading,
    isAnonymousSession,
    inboxQueriesEnabled: inboxRouteEnabled || notificationInboxEnabled,
  };
}
