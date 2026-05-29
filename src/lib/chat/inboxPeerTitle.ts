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

export function isAnonSenderOfProfileChat(
  chat: InboxChat,
  anonSenderId = getChatAnonSenderId(),
) {
  const sessionId = String(anonSenderId || "").trim();
  if (!sessionId.startsWith("anon_")) return false;

  const chatId = chat.canonicalChatId || chat.id;
  if (!isProfileAnonChatId(chatId)) return false;

  const parsedSender = parseProfileAnonChatId(chatId).senderId;
  const storedSession = String(chat.anonSessionId || "").trim();

  return parsedSender === sessionId || storedSession === sessionId;
}

export function isIncomingAnonChatForOwner(chat: InboxChat, viewerUid?: string) {
  if (!viewerUid || viewerUid.startsWith("anon_")) return false;

  const chatId = chat.canonicalChatId || chat.id;
  if (!isProfileAnonChatId(chatId)) return false;

  const { senderId } = parseProfileAnonChatId(chatId);
  if (!senderId.startsWith("anon_")) return false;

  const ownerByUid =
    chat.targetUid === viewerUid ||
    chat.receptorUid === viewerUid ||
    chat.anonOwnerUid === viewerUid;

  return ownerByUid && senderId !== viewerUid;
}

export function chatPeerTitle(
  chat: InboxChat,
  viewerUid?: string,
  viewerUsername?: string,
) {
  const chatId = chat.canonicalChatId || chat.id;
  const username = profileUsername(chat);

  if (isAnonSenderOfProfileChat(chat)) {
    return username || "Chat anónimo";
  }

  if (viewerUid && isIncomingAnonChatForOwner(chat, viewerUid)) {
    const senderId =
      chat.anonSessionId ||
      parseProfileAnonChatId(chatId).senderId ||
      chat.lastMessageSender ||
      "";
    return formatAnonSessionLabel(String(senderId));
  }

  if (
    viewerUsername &&
    username &&
    username.trim().toLowerCase() === viewerUsername.trim().toLowerCase() &&
    viewerUid
  ) {
    const senderId = parseProfileAnonChatId(chatId).senderId;
    if (senderId.startsWith("anon_") && senderId !== viewerUid) {
      return formatAnonSessionLabel(senderId);
    }
  }

  return username || "Chat anónimo";
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
  if (isAnonSenderOfProfileChat(chat)) return false;
  return Boolean(viewerUid && isIncomingAnonChatForOwner(chat, viewerUid));
}

export function shouldShowAnonPeerInbox(chat: InboxChat, viewerUid?: string) {
  if (isAnonSenderOfProfileChat(chat)) return false;
  return Boolean(viewerUid && isIncomingAnonChatForOwner(chat, viewerUid));
}
