import type { InboxChat } from "@/hooks/useChatsInbox";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import {
  isActiveAnonVisitorInboxChat,
  isProfileAnonVisitorInboxChat,
  profileReplyCountsAsVisitorUnread,
  resolveAnonVisitorViewerId,
  unreadCountKeysForVisitor,
} from "@/lib/chat/anonVisitorInbox";
import { isIncomingChatActivity } from "@/lib/chat/incomingChatActivity";
import {
  resolveChatViewerId,
} from "@/lib/chat/inboxPeerTitle";
import { wasChatReadLocally } from "@/lib/chat/localChatRead";

export function resolveInboxViewerId(uid: string) {
  return uid || getChatAnonSenderId();
}

type UnreadCountOptions = {
  firebaseUid?: string;
  excludeChatId?: string;
};

function isExcludedChat(chat: InboxChat, excludeChatId?: string) {
  if (!excludeChatId) return false;
  const chatKey = chat.canonicalChatId || chat.id;
  return excludeChatId === chatKey || excludeChatId === chat.id;
}

function usesFirebaseUnreadKeys(chat: InboxChat, viewerId: string, firebaseUid = "") {
  if (!firebaseUid || viewerId === firebaseUid) return true;
  if (isProfileAnonVisitorInboxChat(chat, firebaseUid)) return false;
  return true;
}

function storedUnreadForViewer(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
) {
  const keys = isActiveAnonVisitorInboxChat(chat, firebaseUid)
    ? unreadCountKeysForVisitor(chat, viewerId, firebaseUid)
    : new Set<string>([viewerId]);

  if (viewerId) keys.add(viewerId);
  if (firebaseUid && usesFirebaseUnreadKeys(chat, viewerId, firebaseUid)) {
    keys.add(firebaseUid);
  }

  for (const key of keys) {
    const stored = chat.unreadCounts?.[key];
    if (typeof stored === "number") return stored;
  }

  return undefined;
}

/** Returns 1 if the chat has pending incoming activity, else 0 (no numeric badges). */
export function chatUnreadCount(
  chat: InboxChat,
  viewerId: string,
  options: UnreadCountOptions = {},
) {
  if (!viewerId) return 0;
  if (isExcludedChat(chat, options.excludeChatId)) return 0;

  const firebaseUid = options.firebaseUid || "";
  const stored = storedUnreadForViewer(chat, viewerId, firebaseUid);
  if (stored === 0) return 0;

  if (wasChatReadLocally(chat, viewerId)) return 0;

  const incoming =
    profileReplyCountsAsVisitorUnread(chat, firebaseUid) ||
    isIncomingChatActivity(chat, viewerId, firebaseUid);

  if (!incoming) return 0;

  if (typeof stored === "number" && stored > 0) return 1;

  // Incoming activity always counts as pending. Do not suppress with stale readBy
  // left over from the visitor's own last message before a profile reply arrives.
  return 1;
}

export function chatUnreadCountForViewer(
  chat: InboxChat,
  firebaseUid = "",
  options: Omit<UnreadCountOptions, "firebaseUid"> = {},
) {
  if (isProfileAnonVisitorInboxChat(chat, firebaseUid)) {
    if (!isActiveAnonVisitorInboxChat(chat, firebaseUid)) return 0;
    const viewerId = resolveAnonVisitorViewerId(chat, firebaseUid);
    return chatUnreadCount(chat, viewerId, { ...options, firebaseUid });
  }

  const viewerId = resolveChatViewerId(chat, firebaseUid);
  return chatUnreadCount(chat, viewerId, { ...options, firebaseUid });
}

export function totalUnreadCount(
  chats: InboxChat[],
  firebaseUid = "",
  options: Omit<UnreadCountOptions, "firebaseUid"> = {},
) {
  return chats.reduce(
    (sum, chat) => sum + chatUnreadCountForViewer(chat, firebaseUid, options),
    0,
  );
}
