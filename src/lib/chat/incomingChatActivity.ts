import type { InboxChat } from "@/hooks/useChatsInbox";
import { isProfileAnonChatId, parseProfileAnonChatId } from "@/lib/chat/anonChatId";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { profileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";
import {
  isAnonVisitorProfileChat,
  isIncomingAnonChatForOwner,
} from "@/lib/chat/inboxPeerTitle";
import { isProfileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";

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

  const sender = String(chat.lastMessageSender || "").trim();
  const readBy = chat.readBy || {};
  const incomingForViewer =
    isIncomingProfileReplyForAnonVisitor(sender, viewerId, firebaseUid, chat) ||
    isIncomingAnonMessageForProfileOwner(sender, firebaseUid, chat);

  if (incomingForViewer) {
    const viewerIds = [...collectViewerSenderIds(chat, viewerId, firebaseUid)];

    for (const id of viewerIds) {
      const unread = chat.unreadCounts?.[id];
      if (typeof unread === "number" && unread > 0) return false;
      if (readBy[id] === false) return false;
    }

    // Stale readBy=true from the visitor's own last send must not hide a profile reply.
    const explicitlyRead = viewerIds.some(
      (id) =>
        readBy[id] === true &&
        typeof chat.unreadCounts?.[id] === "number" &&
        chat.unreadCounts[id] === 0,
    );
    return explicitlyRead;
  }

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

export function isIncomingProfileReplyForAnonVisitor(
  sender: string,
  viewerId: string,
  firebaseUid = "",
  chat?: InboxChat,
) {
  const from = String(sender || "").trim();
  if (!from || !isProfileReplyAuthorId(from)) return false;
  if (viewerId.startsWith("anon_")) return true;
  if (chat && isAnonVisitorProfileChat(chat, firebaseUid)) return true;
  return false;
}

export function isIncomingAnonMessageForProfileOwner(
  sender: string,
  firebaseUid = "",
  chat?: InboxChat,
) {
  const from = String(sender || "").trim();
  if (!from.startsWith("anon_") || !firebaseUid) return false;
  if (chat) return isIncomingAnonChatForOwner(chat, firebaseUid);
  return true;
}

export function isIncomingChatActivity(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
) {
  const preview = String(chat.lastMessage || "").trim();
  const sender = String(chat.lastMessageSender || "").trim();
  if (!preview || !sender || !viewerId) return false;
  if (isIncomingProfileReplyForAnonVisitor(sender, viewerId, firebaseUid, chat)) {
    return true;
  }
  if (isIncomingAnonMessageForProfileOwner(sender, firebaseUid, chat)) {
    return true;
  }
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
  const senderKind = String(data.senderKind || "").trim();
  if (!from || !viewerId) return false;

  if (senderKind === "profile" || isProfileReplyAuthorId(from)) {
    return isIncomingProfileReplyForAnonVisitor(from, viewerId, firebaseUid, chat);
  }

  if (senderKind === "anon" || from.startsWith("anon_")) {
    if (isIncomingAnonMessageForProfileOwner(from, firebaseUid, chat)) {
      return true;
    }
  }

  return !isOwnChatSender(from, viewerId, firebaseUid, chat);
}

export function isProfileAnonMessageUnreadForViewer(
  message: {
    mine?: boolean;
    readBy?: Record<string, boolean>;
    fromUid?: string;
    senderKind?: string;
  },
  viewerId: string,
  firebaseUid = "",
  chat?: InboxChat,
) {
  if (message.mine) return false;
  if (!viewerId) return false;

  const from = String(message.fromUid || "").trim();
  const incoming = isIncomingMessageFromDoc(
    {
      fromUid: from,
      senderKind: message.senderKind,
    },
    viewerId,
    firebaseUid,
    chat,
  );
  if (!incoming) return false;

  const readBy = message.readBy || {};
  if (readBy[viewerId] === true) return false;

  for (const id of chat
    ? collectViewerSenderIds(chat, viewerId, firebaseUid)
    : [viewerId, firebaseUid].filter(Boolean)) {
    if (readBy[id] === true) return false;
  }

  return true;
}
