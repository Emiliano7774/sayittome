import type { InboxChat } from "@/hooks/useChatsInbox";
import {
  isProfileAnonChatId,
  parseProfileAnonChatId,
  safeChatPart,
  usernameHintFromAnonChatId,
} from "@/lib/chat/anonChatId";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";

export function formatAnonSessionLabel(sessionId: string) {
  const raw = String(sessionId || "").trim();
  if (!raw) return "Anónimo";
  if (!raw.startsWith("anon_")) return raw;

  const parts = raw.split("_").filter(Boolean);
  const token = parts[1] || parts[parts.length - 1] || "anon";
  return `Anon-${token.slice(0, 10)}`;
}

function profileUsername(chat: InboxChat) {
  const id = chat.canonicalChatId || chat.id;
  return (
    chat.targetUsername ||
    chat.receptorUsername ||
    chat.otherUsername ||
    usernameHintFromAnonChatId(id) ||
    ""
  );
}

function profileAnonSenderFromChat(chat: InboxChat) {
  const chatId = chat.canonicalChatId || chat.id;
  const stored = String(chat.anonSessionId || "").trim();
  if (stored.startsWith("anon_")) return stored;

  if (isProfileAnonChatId(chatId)) {
    const { senderId } = parseProfileAnonChatId(chatId);
    if (senderId.startsWith("anon_")) return senderId;
  }

  return "";
}

export function isIncomingAnonChatForOwner(chat: InboxChat, viewerUid?: string) {
  if (!viewerUid || viewerUid.startsWith("anon_")) return false;

  const chatId = chat.canonicalChatId || chat.id;
  if (!isProfileAnonChatId(chatId)) return false;

  const { senderId } = parseProfileAnonChatId(chatId);
  if (!senderId.startsWith("anon_")) return false;

  const ownerByUid =
    chat.targetUid === viewerUid ||
    chat.receptorUid === viewerUid;

  return ownerByUid && senderId !== viewerUid;
}

/** Inbox row shows the profile (name + photo), not the anon label. */
export function isProfilePeerForInbox(chat: InboxChat, firebaseUid?: string) {
  const chatId = chat.canonicalChatId || chat.id;
  if (!isProfileAnonChatId(chatId)) return true;

  if (firebaseUid && isIncomingAnonChatForOwner(chat, firebaseUid)) {
    return false;
  }

  return true;
}

export function chatPeerTitle(
  chat: InboxChat,
  viewerUid?: string,
  viewerUsername?: string,
) {
  const chatId = chat.canonicalChatId || chat.id;
  const username = profileUsername(chat);

  if (isProfilePeerForInbox(chat, viewerUid)) {
    return username || "Chat anónimo";
  }

  const senderId =
    chat.anonSessionId ||
    parseProfileAnonChatId(chatId).senderId ||
    chat.lastMessageSender ||
    "";
  return formatAnonSessionLabel(String(senderId));
}

export function inboxPeerDedupeKey(chat: InboxChat, viewerUid?: string) {
  const chatId = chat.canonicalChatId || chat.id;

  if (viewerUid && isIncomingAnonChatForOwner(chat, viewerUid)) {
    return `anon-thread:${chatId}`;
  }

  const title = profileUsername(chat);
  if (title) return `profile:${safeChatPart(title)}`;
  if (isProfileAnonChatId(chatId)) {
    return `profile:${parseProfileAnonChatId(chatId).targetKey}`;
  }
  return `id:${chatId}`;
}

export function shouldHidePeerProfilePhoto(chat: InboxChat, viewerUid?: string) {
  return !isProfilePeerForInbox(chat, viewerUid);
}

export function shouldShowAnonPeerInbox(chat: InboxChat, viewerUid?: string) {
  return !isProfilePeerForInbox(chat, viewerUid);
}

export function resolveChatViewerId(chat: InboxChat, firebaseUid = "") {
  if (firebaseUid && isIncomingAnonChatForOwner(chat, firebaseUid)) {
    return firebaseUid;
  }

  const threadAnonId = profileAnonSenderFromChat(chat);
  if (threadAnonId) return threadAnonId;

  return firebaseUid || getChatAnonSenderId();
}
