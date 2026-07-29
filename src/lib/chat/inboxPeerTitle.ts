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

export function profileAnonSenderFromChat(chat: InboxChat) {
  const chatId = chat.canonicalChatId || chat.id;
  const stored = String(chat.anonSessionId || "").trim();
  const fromChatId =
    isProfileAnonChatId(chatId) &&
    parseProfileAnonChatId(chatId).senderId.startsWith("anon_")
      ? parseProfileAnonChatId(chatId).senderId
      : "";

  // Prefer the anon baked into chatId over a poisoned anonSessionId (owner
  // browser session historically written into the doc).
  if (fromChatId && stored.startsWith("anon_") && stored !== fromChatId) {
    return fromChatId;
  }
  if (fromChatId) return fromChatId;
  if (stored.startsWith("anon_")) return stored;

  return "";
}

export function isIncomingAnonChatForOwner(chat: InboxChat, viewerUid?: string) {
  if (!viewerUid || viewerUid.startsWith("anon_")) return false;

  const chatId = chat.canonicalChatId || chat.id;
  if (!isProfileAnonChatId(chatId)) return false;

  const parsedSenderId = parseProfileAnonChatId(chatId).senderId;
  const storedAnonId = String(chat.anonSessionId || "").trim();
  const senderId = storedAnonId.startsWith("anon_")
    ? storedAnonId
    : parsedSenderId.startsWith("anon_")
      ? parsedSenderId
      : parsedSenderId || storedAnonId;

  if (!senderId || senderId === viewerUid) return false;

  const ownerByUid =
    chat.targetUid === viewerUid ||
    chat.receptorUid === viewerUid ||
    chat.anonOwnerUid === viewerUid;

  return ownerByUid;
}

/** Visitor messaging a profile as anon (not the profile owner inbox row). */
export function isAnonVisitorProfileChat(chat: InboxChat, firebaseUid = "") {
  const chatId = chat.canonicalChatId || chat.id;
  if (!isProfileAnonChatId(chatId)) return false;
  if (firebaseUid && isIncomingAnonChatForOwner(chat, firebaseUid)) return false;

  const threadAnonId = profileAnonSenderFromChat(chat);
  if (!threadAnonId.startsWith("anon_")) return false;

  const liveAnonId = getChatAnonSenderId();
  if (threadAnonId === liveAnonId) return true;

  // Firebase anonymous auth uid must not block visitor detection when the live
  // anon session matches the thread (or is present in participantes).
  if (liveAnonId.startsWith("anon_")) {
    const members = chat.participantes || [];
    if (members.includes(liveAnonId)) return true;
    // Live anon present and viewer is not profile owner ⇒ visitor context even
    // when session regenerated away from chatId (inbox still keyed by thread).
    return true;
  }

  return false;
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

  if (isAnonVisitorProfileChat(chat, viewerUid || "")) {
    return `anon-visitor:${chatId}`;
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
