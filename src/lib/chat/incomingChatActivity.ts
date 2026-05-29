import type { InboxChat } from "@/hooks/useChatsInbox";
import { profileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";

export function isOwnChatSender(
  sender: string,
  viewerId: string,
  firebaseUid = "",
) {
  const from = String(sender || "").trim();
  if (!from) return true;
  if (from === viewerId) return true;
  if (firebaseUid && from === firebaseUid) return true;
  if (firebaseUid && from === profileReplyAuthorId(firebaseUid)) return true;
  return false;
}

export function isIncomingChatActivity(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
) {
  const sender = String(chat.lastMessageSender || "");
  const preview = String(chat.lastMessage || "").trim();
  if (!preview || !sender || !viewerId) return false;
  return !isOwnChatSender(sender, viewerId, firebaseUid);
}

export function chatActivityKey(chat: InboxChat) {
  return `${chat.lastMessage || ""}|${chat.lastMessageSender || ""}|${chat.updatedAt?.toMillis?.() ?? 0}`;
}

export function isIncomingMessageFromDoc(
  data: {
    fromUid?: string;
    ownerId?: string;
    senderUid?: string;
    senderKind?: string;
  },
  viewerId: string,
  firebaseUid = "",
) {
  const from = String(data.fromUid || data.ownerId || data.senderUid || "");
  if (!from || !viewerId) return false;
  return !isOwnChatSender(from, viewerId, firebaseUid);
}
