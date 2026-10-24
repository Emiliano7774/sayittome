"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useEffectivePathname } from "@/contexts/MainTabShellContext";

import { useAuth } from "@/contexts/AuthContext";
import { useDocumentHidden } from "@/hooks/useDocumentHidden";
import { useChatsInbox } from "@/hooks/useChatsInbox";
import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";
import { isAnonDirectInboxChat, isVerifiedAnonDirectIncomingChat, mergeInboxWithAnonDirectBridge } from "@/lib/anonMatch/anonDirectInboxBridge";
import { globalChatWhipManager } from "@/lib/chat/globalChatWhipManager";
import { chatPeerTitle, resolveChatViewerId } from "@/lib/chat/inboxPeerTitle";
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
import { isIncomingChatActivity, isOwnChatSender } from "@/lib/chat/incomingChatActivity";
import { classifiedInboxNotificationIds } from "@/lib/chat/incomingChatNotification";
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
import { isLocalOutgoingMessageId, tryAlertIncomingMessage } from "@/lib/chat/whipAlertDedupe";
import { bindWhipSoundUnlock, playIncomingWhipSound } from "@/lib/chat/whipSound";
import { isCapacitorNative } from "@/lib/app/nativeShell";
import {
  enableWebChatPush,
  hasActiveFcmRegistration,
  reconcileWebChatPush,
  setAnonArrivalPushEnabled,
} from "@/lib/chat/fcmPush";
import { getAnonArrivalPushPreference } from "@/lib/chat/anonArrivalPrefs";
import { shouldAutoReconcileWebPush } from "@/lib/chat/webPushAutoPolicy";
import { auth } from "@/lib/firebase";

/** Anonymous-direct rows have Auth-UID authorship, not profile/anon role inference. */
function isVerifiedInboxIncoming(chat: import("@/hooks/useChatsInbox").InboxChat, threadViewer: string, firebaseUid: string) {
  if (isAnonDirectInboxChat(chat)) return isVerifiedAnonDirectIncomingChat(chat, firebaseUid);
  const sender = String(chat.lastMessageSender || "").trim();
  return Boolean(sender && isIncomingChatActivity(chat, threadViewer, firebaseUid) &&
    !isOwnChatSender(sender, threadViewer, firebaseUid, chat));
}

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
  const anonMatch = useAnonMatchOptional();
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

  const mergedChats = useMemo(
    () => mergeInboxWithAnonDirectBridge(
      sortedChats.length > 0 ? sortedChats : displaySortedChats,
      anonMatch?.anonDirectInboxRows || [],
    ),
    [sortedChats, displaySortedChats, anonMatch?.anonDirectInboxRows],
  );
  const viewerId = resolveInboxViewerId(uid);
  const firebaseUid = firebaseUser?.uid || uid || "";
  const localReadVersion = useSyncExternalStore(subscribeLocalChatRead, getLocalChatReadVersion, () => 0);
  useSyncExternalStore(subscribeSessionChatIds, getSessionChatIdsVersion, () => "");
  const pendingChatsVersion = useSyncExternalStore(subscribeLocalPendingChats, getLocalPendingChatsVersion, () => "0");

  const activeChatId = (() => {
    const match = pathname.match(/\/chat\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  })();

  // Prefer the rows the UI already trusts (snapshot fallback included). Waiting
  // only on live sortedChats hid the orange tick until the user opened /chats.
  const unreadSource = mergedChats;
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
  // On /chats, match the row-level unread policy: cached unsynced summaries
  // do not paint unread rows and must not independently keep the nav tick on.
  const inboxUnread = unreadHydrated && (pathname !== "/chats" || firestoreSynced)
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
    const stillUnread = (chatId: string): boolean | null => {
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
    };
    reconcileLocalPendingChats(stillUnread);

    // A fresh whip latch is protected for 2.5 s. Previously, when no further
    // Firestore snapshot arrived, nothing ran reconciliation after that grace:
    // an already-read chat left the bottom-nav orange dot stuck indefinitely.
    // One-shot local timer only; no extra Firestore reads or subscriptions.
    if (countLocalPendingChats() === 0) return;
    const timeout = window.setTimeout(() => {
      reconcileLocalPendingChats(stillUnread);
    }, 2700);
    return () => window.clearTimeout(timeout);
  }, [
    unreadHydrated,
    inboxRouteEnabled,
    unreadSource,
    firebaseUid,
    activeChatId,
    firestoreSynced,
    localReadVersion,
    pendingChatsVersion,
  ]);

  const seenLatestMessageIdsRef = useRef<Map<string, string> | null>(null);
  const inboxAlertSignature = unreadSource
    .map((chat) => `${chat.canonicalChatId || chat.id}:${chat.latestMessageId || ""}`)
    .join("|");

  // Whip only watches 25 threads and can miss the first live snapshot. Inbox
  // latestMessageId transitions still raise the browser banner on Shuffle /
  // Stories without opening /chats. Deduped with the whip path via message id.
  useEffect(() => {
    // Homepage still hydrates the notification inbox when opted in. Never
    // restrict banners to bottom-tab routes while their listeners are active.
    // The foreground web banner is a chat UI feature, not an OS permission.
    // Native Push still honors its opt-in; web foreground remains useful when
    // the browser refuses Notification.permission or FCM token registration.
    if (!unreadHydrated ||
        !(notificationInboxEnabled || (!isCapacitorNative() && inboxRouteEnabled))) return;
    const previous = seenLatestMessageIdsRef.current;
    const next = classifiedInboxNotificationIds(unreadSource, firebaseUid, previous);
    seenLatestMessageIdsRef.current = next;
    if (!previous) {
      // First hydration: no indiscriminate historical alerts. Recover only rows
      // that already look like a live unread inbound (whip may have skipped an
      // ambiguous first snapshot without burning the id).
      for (const chat of unreadSource) {
        const chatId = chat.canonicalChatId || chat.id;
        if (!chatId || chatId === activeChatId) continue;
        const latest = String(chat.latestMessageId || "");
        if (!latest || isLocalOutgoingMessageId(chatId, latest)) continue;
        if (
          chatUnreadCountForViewer(chat, firebaseUid, {
            excludeChatId: activeChatId,
          }) <= 0
        ) {
          continue;
        }
        const threadViewer = resolveChatViewerId(chat, firebaseUid);
        // A new id alone can be our own send; never alert on absent/stale
        // direction metadata. Use the THREAD viewer, not the global uid.
        if (!isVerifiedInboxIncoming(chat, threadViewer, firebaseUid)) {
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
      if (!latest || prior === latest || isLocalOutgoingMessageId(chatId, latest)) continue;
      if (chatId === activeChatId && isCapacitorNative()) continue;
      // An exact new message ID plus confirmed opposite-side authorship is
      // enough for the WEB banner. readBy/unreadCounts can lag the message
      // snapshot (or be immediately cleared by a visible thread); requiring
      // an unread badge here silently loses a real incoming notification.
      // The orange badge continues using chatUnreadCountForViewer unchanged.
      const threadViewer = resolveChatViewerId(chat, firebaseUid);
      if (!isVerifiedInboxIncoming(chat, threadViewer, firebaseUid)) continue;
      const arrivedAt = Number(chat.lastMessageAt?.toMillis?.() || 0);
      // A restored inbox row can change IDs while opening a chat. Even when
      // there was a previous ID, old history is never a fresh notification.
      if (!arrivedAt || Date.now() - arrivedAt > 2 * 60_000 ||
          arrivedAt > Date.now() + 30_000) {
        continue;
      }
      tryAlertIncomingMessage({
        chatId,
        messageId: latest,
        incoming: true,
        suppress: false,
        onAlert: () => {
          // Keep the already-PASS orange pending contract unchanged: the
          // browser banner may run ahead of read receipts, but a read thread
          // must not be re-bolded just to deliver its OS notification.
          if (chatId !== activeChatId &&
              chatUnreadCountForViewer(chat, firebaseUid, {
                excludeChatId: activeChatId,
              }) > 0) {
            markLocalPendingChat(chatId);
          }
          playIncomingWhipSound();
          void showChatNotification({
            title: chatPeerTitle(chat, firebaseUid) || "Nuevo mensaje",
            body: String(chat.lastMessage || "Nuevo mensaje"),
            chatId,
            messageId: latest,
            viewingActiveChat: chatId === activeChatId,
          });
        },
      });
    }
  }, [
    unreadHydrated,
    notificationInboxEnabled,
    inboxRouteEnabled,
    inboxAlertSignature,
    unreadSource,
    activeChatId,
    viewerId,
    firebaseUid,
  ]);

  const pathnameRef = useRef(pathname);
  const sortedChatsRef = useRef(sortedChats);

  pathnameRef.current = pathname;
  sortedChatsRef.current = mergedChats;

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

  // One global web-push bootstrap for profiles AND anonymous sessions, mounted
  // through ChatAlertsProvider on every route. Anon arrivals are always opted
  // in at app level, even if messages are off and /settings is inaccessible.
  // Never request the browser permission here: only a user gesture may do that.
  // No Firestore inbox reads or periodic polling for push registration.
  useEffect(() => {
    if (!firebaseUser || isCapacitorNative()) return;
    let stopped = false;
    let lastAttemptAt = 0;
    let retryAttempted = false;
    let retry: number | undefined;
    const uid = firebaseUser.uid;
    const allowed = () => shouldAutoReconcileWebPush({
      uid,
      native: isCapacitorNative(),
      permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
      messagesEnabled: areChatNotificationsEnabled(),
      arrivalsEnabled: getAnonArrivalPushPreference(uid),
    });
    const attempt = () => {
      if (stopped || !allowed() || Date.now() - lastAttemptAt < 10_000) return;
      lastAttemptAt = Date.now();
      // Validate PushManager + current user token once on boot and on resume.
      // Successful checks and temporary failures already have durable, shared
      // throttles inside the FCM registration and topic-sync layers.
      void reconcileWebChatPush(firebaseUser).then((result) => {
        if (stopped || authCurrentUidChanged()) return;
        if (result.ok && getAnonArrivalPushPreference(uid)) {
          // Arrival topic is separate from messages. Sync even when the user
          // opted out of messages; automatic:true honors topic backoff.
          void setAnonArrivalPushEnabled(true, { repair: false, automatic: true })
            .catch(() => undefined);
        }
        if (result.ok || retry || retryAttempted) return;
        retry = window.setTimeout(() => {
          retry = undefined;
          retryAttempted = true;
          attempt();
        }, 12_000);
      }).catch(() => undefined);
    };
    const authCurrentUidChanged = () => auth.currentUser?.uid !== uid;
    const onResume = () => {
      if (document.visibilityState === "visible") attempt();
    };
    attempt();
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("online", onResume);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("sayittome:anon-arrival-prefs", attempt);
    window.addEventListener("sayittome:chat-notification-prefs", attempt);
    return () => {
      stopped = true;
      if (retry) window.clearTimeout(retry);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("online", onResume);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("sayittome:anon-arrival-prefs", attempt);
      window.removeEventListener("sayittome:chat-notification-prefs", attempt);
    };
  }, [firebaseUser?.uid, notificationsEnabled]);

  // Keep the first-time permission prompt on the established in-app/loading
  // path. The eager effect above only runs for permission already granted.
  useEffect(() => {
    if (!chatAlertsRouteEnabled || loading || !notificationsEnabled) return;
    // A permission granted before this page belongs to the throttled reconcile
    // above; only a grant obtained by this prompt registers immediately.
    const grantedBefore =
      typeof Notification !== "undefined" && Notification.permission === "granted";
    void requestChatNotificationPermission().then((granted) => {
      if (
        granted &&
        !grantedBefore &&
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
    // Existing global whip subscribes to chats/{id}/mensajes, not
    // chats_anonimos. The direct-shell listeners already supply incoming
    // activity; never misroute those IDs into the regular-chat manager.
    const inboxIds = mergedChats
      .filter((chat) => !isAnonDirectInboxChat(chat))
      .map((chat) => chat.canonicalChatId || chat.id);
    globalChatWhipManager.syncInboxChatIds(
      Array.from(new Set([...inboxIds, ...getSessionChatIds()])),
    );
  }, [
    chatAlertsRouteEnabled,
    messageListenersEnabled,
    mergedChats,
  ]);

  return useMemo(
    () => ({
      totalUnread,
      viewerId,
      sortedChats: mergedChats,
      uid,
      loading,
      isAnonymousSession,
      inboxQueriesEnabled: inboxRouteEnabled || notificationInboxEnabled,
      firestoreSynced,
    }),
    [
      totalUnread,
      viewerId,
      mergedChats,
      uid,
      loading,
      isAnonymousSession,
      inboxRouteEnabled,
      notificationInboxEnabled,
      firestoreSynced,
    ],
  );
}
