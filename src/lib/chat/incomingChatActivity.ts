import type { InboxChat } from "@/hooks/useChatsInbox";
import { isProfileAnonChatId, parseProfileAnonChatId } from "@/lib/chat/anonChatId";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { profileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";
import { isIncomingAnonChatForOwner } from "@/lib/chat/inboxPeerTitle";

export function collectViewerSenderIds(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
) {
  const ids = new Set<string>();
  const add = (value: string) => {
    const id = String(value || "").trim();
    if (id) ids.add(id);
  };

  add(viewerId);
  add(firebaseUid);
  if (firebaseUid) add(profileReplyAuthorId(firebaseUid));

  const storedAnon = String(chat.anonSessionId || "").trim();
  if (storedAnon.startsWith("anon_")) add(storedAnon);

  const chatId = chat.canonicalChatId || chat.id;
  if (isProfileAnonChatId(chatId)) {
    const parsedAnon = parseProfileAnonChatId(chatId).senderId;
    if (parsedAnon.startsWith("anon_")) add(parsedAnon);
  }

  const liveAnonId = getChatAnonSenderId();
  if (liveAnonId.startsWith("anon_")) add(liveAnonId);

  if (Array.isArray(chat.participantes)) {
    for (const participant of chat.participantes) {
      if (participant.startsWith("anon_")) add(participant);
    }
  }

  return ids;
}

export function isOwnChatSender(
  sender: string,
  viewerId: string,
  firebaseUid = "",
  chat?: InboxChat,
) {
  const from = String(sender || "").trim();
  if (!from) return true;
  if (from === viewerId) return true;
  if (firebaseUid && from === firebaseUid) return true;
  if (firebaseUid && from === profileReplyAuthorId(firebaseUid)) return true;

  if (chat) {
    for (const id of collectViewerSenderIds(chat, viewerId, firebaseUid)) {
      if (from === id) return true;
    }
  }

  return false;
}

export function isOwnInboxLastSender(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
) {
  return isOwnChatSender(
    String(chat.lastMessageSender || ""),
    viewerId,
    firebaseUid,
    chat,
  );
}

export function wasChatReadOnServer(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
) {
  if (isOwnInboxLastSender(chat, viewerId, firebaseUid)) {
    return true;
  }

  const readBy = chat.readBy || {};
  if (readBy[viewerId] === true) return true;

  for (const id of collectViewerSenderIds(chat, viewerId, firebaseUid)) {
    if (!id.startsWith("anon_")) continue;
    if (readBy[id] === true) return true;
  }

  if (firebaseUid && isIncomingAnonChatForOwner(chat, firebaseUid)) {
    if (readBy[firebaseUid] === true) return true;
    if (readBy[profileReplyAuthorId(firebaseUid)] === true) return true;
  }

  return false;
}

export function isIncomingChatActivity(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
) {
  const preview = String(chat.lastMessage || "").trim();
  const sender = String(chat.lastMessageSender || "").trim();
  if (!preview || !sender || !viewerId) return false;
  return !isOwnInboxLastSender(chat, viewerId, firebaseUid);
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
  chat?: InboxChat,
) {
  const from = String(data.fromUid || data.ownerId || data.senderUid || "");
  if (!from || !viewerId) return false;
  return !isOwnChatSender(from, viewerId, firebaseUid, chat);
}
