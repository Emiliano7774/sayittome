import type { InboxChat } from "@/hooks/useChatsInbox";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { isOwnChatSender } from "@/lib/chat/incomingChatActivity";
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

export function chatUnreadCount(
  chat: InboxChat,
  viewerId: string,
  options: UnreadCountOptions = {},
) {
  if (!viewerId) return 0;
  if (isExcludedChat(chat, options.excludeChatId)) return 0;

  if (wasChatReadLocally(chat, viewerId)) return 0;

  if (chat.readBy?.[viewerId] === true) return 0;

  const sender = String(chat.lastMessageSender || "");
  const preview = String(chat.lastMessage || "").trim();
  if (!preview || !sender) return 0;
  if (isOwnChatSender(sender, viewerId, options.firebaseUid || "")) return 0;

  const stored = chat.unreadCounts?.[viewerId];
  if (typeof stored === "number" && stored > 0) {
    return stored;
  }

  return 1;
}

export function chatUnreadCountForViewer(
  chat: InboxChat,
  firebaseUid = "",
  options: UnreadCountOptions = {},
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
