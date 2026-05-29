import type { InboxChat } from "@/hooks/useChatsInbox";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";

export function resolveInboxViewerId(uid: string) {
  return uid || getChatAnonSenderId();
}

export function chatUnreadCount(chat: InboxChat, viewerId: string) {
  if (!viewerId) return 0;

  const stored = chat.unreadCounts?.[viewerId];
  if (typeof stored === "number" && stored > 0) {
    return stored;
  }

  const sender = String(chat.lastMessageSender || "");
  const preview = String(chat.lastMessage || "").trim();
  if (!preview || !sender || sender === viewerId) return 0;
  if (chat.readBy?.[viewerId] === true) return 0;

  return 1;
}

export function totalUnreadCount(chats: InboxChat[], viewerId: string) {
  return chats.reduce((sum, chat) => sum + chatUnreadCount(chat, viewerId), 0);
}
