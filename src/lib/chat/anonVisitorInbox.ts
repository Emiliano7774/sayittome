import type { InboxChat } from "@/hooks/useChatsInbox";
import { isProfileAnonChatId } from "@/lib/chat/anonChatId";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import {
  isIncomingAnonChatForOwner,
  profileAnonSenderFromChat,
} from "@/lib/chat/inboxPeerTitle";
import { isProfileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";
import { getSessionChatIds } from "@/lib/chat/sessionChats";

/** Profile anon chat row shown to the visitor (not the profile owner inbox). */
export function isProfileAnonVisitorInboxChat(chat: InboxChat, firebaseUid = "") {
  const chatId = chat.canonicalChatId || chat.id;
  if (!isProfileAnonChatId(chatId)) return false;
  if (firebaseUid && isIncomingAnonChatForOwner(chat, firebaseUid)) return false;
  return true;
}

export function resolveAnonVisitorViewerId(chat: InboxChat, firebaseUid = "") {
  const threadAnonId = profileAnonSenderFromChat(chat);
  if (threadAnonId.startsWith("anon_")) return threadAnonId;
  return firebaseUid || getChatAnonSenderId();
}

/** Visitor still tied to this thread (current anon, stored thread, or open session chat). */
export function isActiveAnonVisitorInboxChat(chat: InboxChat, firebaseUid = "") {
  if (!isProfileAnonVisitorInboxChat(chat, firebaseUid)) return false;

  const chatId = chat.canonicalChatId || chat.id;
  const threadAnonId = profileAnonSenderFromChat(chat);
  const liveAnonId = getChatAnonSenderId();

  if (getSessionChatIds().includes(chatId)) return true;
  if (threadAnonId && threadAnonId === liveAnonId) return true;
  if (liveAnonId.startsWith("anon_") && chat.participantes?.includes(liveAnonId)) {
    return true;
  }

  return Boolean(threadAnonId);
}

export function profileReplyCountsAsVisitorUnread(
  chat: InboxChat,
  firebaseUid = "",
) {
  if (!isProfileAnonVisitorInboxChat(chat, firebaseUid)) return false;
  const sender = String(chat.lastMessageSender || "").trim();
  return isProfileReplyAuthorId(sender);
}

export function unreadCountKeysForVisitor(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
) {
  const keys = new Set<string>();
  if (viewerId) keys.add(viewerId);

  const threadAnonId = profileAnonSenderFromChat(chat);
  if (threadAnonId) keys.add(threadAnonId);

  const liveAnonId = getChatAnonSenderId();
  if (liveAnonId.startsWith("anon_")) keys.add(liveAnonId);

  if (firebaseUid) keys.add(firebaseUid);

  return keys;
}
