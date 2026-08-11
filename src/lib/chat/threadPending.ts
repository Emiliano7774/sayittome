import type { InboxChat } from "@/hooks/useChatsInbox";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import {
  isIncomingChatActivity,
  isOwnChatSender,
  resolveChatViewerRole,
  type ChatViewerRoleInput,
} from "@/lib/chat/incomingChatActivity";
import {
  profileAnonSenderFromChat,
  resolveChatViewerId,
} from "@/lib/chat/inboxPeerTitle";
import { wasChatReadLocally } from "@/lib/chat/localChatRead";

export function chatTimestampMs(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object") return 0;
  const timestamp = value as {
    toMillis?: () => number;
    seconds?: number;
    nanoseconds?: number;
    _seconds?: number;
    _nanoseconds?: number;
  };
  if (typeof timestamp.toMillis === "function") {
    try {
      return Number(timestamp.toMillis()) || 0;
    } catch {
      return 0;
    }
  }
  const seconds = Number(timestamp.seconds ?? timestamp._seconds ?? 0);
  const nanos = Number(timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0);
  return seconds > 0 ? seconds * 1000 + Math.floor(nanos / 1_000_000) : 0;
}

export type ThreadPendingResult = {
  threadId: string;
  viewerId: string;
  candidateViewerIds: string[];
  latestMessageId: string;
  latestSenderKind: string;
  latestSenderUid: string;
  latestSenderAnonSessionId: string;
  currentAnonSessionId: string;
  isOwnLatestMessage: boolean;
  latestAt: number;
  readAt: number;
  serverUnreadSignal: boolean;
  localRead: boolean;
  activeDetail: boolean;
  computedPending: boolean;
  reason: string;
};

/**
 * Single source of truth for bottom badge and inbox-row pending state.
 * Uses metadata already present on the chat doc; it creates no reads/listeners.
 */
export function computeThreadPendingForViewer(
  chat: InboxChat,
  firebaseUid = "",
  activeDetailThreadId = "",
  roleInput?: ChatViewerRoleInput,
): ThreadPendingResult {
  const threadId = chat.canonicalChatId || chat.id;
  const viewerId = resolveChatViewerId(chat, firebaseUid);
  const role = resolveChatViewerRole({
    viewerId,
    firebaseUid,
    chat,
    viewerKind: roleInput?.viewerKind,
    provenOwner: roleInput?.provenOwner,
  });
  const currentAnonSessionId = getChatAnonSenderId();
  const threadAnon = profileAnonSenderFromChat(chat);
  const candidates = new Set<string>();
  if (viewerId) candidates.add(viewerId);

  if (role.viewerKind === "anon" && !role.provenOwner) {
    if (threadAnon.startsWith("anon_")) candidates.add(threadAnon);
    if (currentAnonSessionId.startsWith("anon_")) {
      candidates.add(currentAnonSessionId);
    }
  } else if (firebaseUid) {
    candidates.add(firebaseUid);
  }

  const candidateViewerIds = [...candidates];
  const latestSenderUid = String(chat.lastMessageSender || "").trim();
  const latestMessageId = String(chat.latestMessageId || "").trim();
  const latestSenderKind =
    String(chat.latestSenderKind || "").trim() ||
    (latestSenderUid.startsWith("profile_")
      ? "profile"
      : latestSenderUid.startsWith("anon_")
        ? "anon"
        : "unknown");
  const latestSenderAnonSessionId = String(
    chat.latestSenderAnonSessionId || "",
  ).trim();
  const latestAt =
    chatTimestampMs(chat.lastMessageAt) || chatTimestampMs(chat.updatedAt);
  const activeDetail =
    Boolean(activeDetailThreadId) &&
    (activeDetailThreadId === threadId || activeDetailThreadId === chat.id);
  const isOwnLatestMessage =
    isOwnChatSender(latestSenderUid, viewerId, firebaseUid, chat, role) ||
    (latestSenderAnonSessionId.startsWith("anon_") &&
      isOwnChatSender(latestSenderAnonSessionId, viewerId, firebaseUid, chat, role));
  const incoming =
    Boolean(String(chat.lastMessage || "").trim()) &&
    isIncomingChatActivity(chat, viewerId, firebaseUid, role);

  let serverUnreadSignal = false;
  let readAt = 0;
  for (const id of candidateViewerIds) {
    if ((chat.unreadCounts?.[id] || 0) > 0 || chat.readBy?.[id] === false) {
      serverUnreadSignal = true;
    }
    readAt = Math.max(readAt, chatTimestampMs(chat.readAt?.[id]));
  }

  const localRead = wasChatReadLocally(chat, viewerId, firebaseUid);
  let readMessageIdMatch = false;
  if (latestMessageId) {
    for (const id of candidateViewerIds) {
      if (String(chat.latestReadMessageIds?.[id] || "").trim() === latestMessageId) {
        readMessageIdMatch = true;
        break;
      }
    }
    if (
      !readMessageIdMatch &&
      String(chat.latestReadMessageId || "").trim() === latestMessageId &&
      (localRead || chat.readBy?.[viewerId] === true)
    ) {
      readMessageIdMatch = true;
    }
  }

  let computedPending = false;
  let reason = "not-incoming";

  if (activeDetail) {
    reason = "exact-detail-open";
  } else if (!incoming || isOwnLatestMessage) {
    reason = isOwnLatestMessage ? "latest-own" : "not-incoming";
  } else if (localRead || readMessageIdMatch) {
    // Prefer exact rendered/local read over stale server unreadCounts that can
    // arrive after markChatAsRead when the sender's outbound meta is late.
    reason = localRead
      ? "local-read-current-activity"
      : "latest-read-message-id-match";
  } else if (serverUnreadSignal) {
    computedPending = true;
    reason = "server-unread-signal";
  } else if (latestAt > 0 && latestAt > readAt) {
    computedPending = true;
    reason = "latest-after-read";
  } else if (latestMessageId && readAt === 0) {
    computedPending = true;
    reason = "new-message-id-no-read-marker";
  } else if (chat.readBy?.[viewerId] === true) {
    reason = "server-read-current";
  } else {
    // Profile reply with no usable legacy unread/read metadata must fail open
    // to pending, never silently hide a real inbound message.
    computedPending = latestSenderKind === "profile";
    reason = computedPending ? "profile-inbound-fallback" : "no-pending-signal";
  }

  return {
    threadId,
    viewerId,
    candidateViewerIds,
    latestMessageId,
    latestSenderKind,
    latestSenderUid,
    latestSenderAnonSessionId,
    currentAnonSessionId,
    isOwnLatestMessage,
    latestAt,
    readAt,
    serverUnreadSignal,
    localRead,
    activeDetail,
    computedPending,
    reason,
  };
}
