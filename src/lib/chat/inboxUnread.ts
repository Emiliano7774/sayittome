import type { InboxChat } from "@/hooks/useChatsInbox";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { isIncomingChatActivity } from "@/lib/chat/incomingChatActivity";
import { resolveChatViewerId } from "@/lib/chat/inboxPeerTitle";
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

function storedUnreadForViewer(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
) {
  const keys = new Set<string>();
  if (viewerId) keys.add(viewerId);
  if (firebaseUid) keys.add(firebaseUid);

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

  const stored = storedUnreadForViewer(chat, viewerId, options.firebaseUid || "");
  if (stored === 0) return 0;

  if (wasChatReadLocally(chat, viewerId)) return 0;

  if (!isIncomingChatActivity(chat, viewerId, options.firebaseUid || "")) return 0;

  if (typeof stored === "number" && stored > 0) return 1;

  if (chat.readBy?.[viewerId] === true) return 0;
  if (options.firebaseUid && chat.readBy?.[options.firebaseUid] === true) return 0;

  return 1;
}

export function chatUnreadCountForViewer(
  chat: InboxChat,
  firebaseUid = "",
  options: Omit<UnreadCountOptions, "firebaseUid"> = {},
) {
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
