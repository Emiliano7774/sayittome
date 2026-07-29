import type { InboxChat } from "@/hooks/useChatsInbox";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { computeThreadPendingForViewer } from "@/lib/chat/threadPending";

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

/** Returns 1 if the chat has pending incoming activity, else 0 (no numeric badges). */
export function chatUnreadCount(
  chat: InboxChat,
  viewerId: string,
  options: UnreadCountOptions = {},
) {
  if (!viewerId) return 0;
  const firebaseUid = options.firebaseUid || "";
  const activeDetailThreadId = isExcludedChat(chat, options.excludeChatId)
    ? options.excludeChatId || ""
    : "";
  return computeThreadPendingForViewer(
    chat,
    firebaseUid,
    activeDetailThreadId,
  ).computedPending
    ? 1
    : 0;
}

export function chatUnreadCountForViewer(
  chat: InboxChat,
  firebaseUid = "",
  options: Omit<UnreadCountOptions, "firebaseUid"> = {},
) {
  const viewerId = resolveInboxViewerId(firebaseUid);
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
