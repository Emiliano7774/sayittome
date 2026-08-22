import type { InboxChat } from "@/hooks/useChatsInbox";
import {
  isProfileAnonChatId,
  parseProfileAnonChatId,
  safeChatPart,
  usernameHintFromAnonChatId,
} from "@/lib/chat/anonChatId";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { hasInboxPreview, isVisibleInboxChat } from "@/lib/chat/inboxVisible";

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

  // Distinct authorized threads stay distinct. Username-only keys collapsed
  // separate anon sessions / chatIds into one inbox row.
  if (chatId) return `thread:${chatId}`;

  const title = profileUsername(chat);
  if (title) return `profile:${safeChatPart(title)}`;
  if (isProfileAnonChatId(chatId)) {
    return `profile:${parseProfileAnonChatId(chatId).targetKey}`;
  }
  return `id:${chatId}`;
}

export function dedupeInboxChats(chats: InboxChat[], viewerUid = "") {
  const map = new Map<string, InboxChat>();

  for (const chat of chats) {
    const key = inboxPeerDedupeKey(chat, viewerUid || undefined);
    const existing = map.get(key);
    const chatMs = chat.updatedAt?.toMillis?.() ?? 0;
    const existingMs = existing?.updatedAt?.toMillis?.() ?? 0;
    const mergedPhoto = chat.targetPhoto || existing?.targetPhoto;
    const chatVisible = hasInboxPreview(chat);
    const existingVisible = existing ? hasInboxPreview(existing) : false;

    let winner = chat;
    if (existing) {
      if (chatVisible && !existingVisible) {
        winner = chat;
      } else if (!chatVisible && existingVisible) {
        winner = existing;
      } else if (chatMs >= existingMs) {
        winner = chat;
      } else {
        winner = existing;
      }
    }

    const mergedTargetPhoto = winner.targetPhoto || mergedPhoto;
    map.set(
      key,
      mergedTargetPhoto ? { ...winner, targetPhoto: mergedTargetPhoto } : winner,
    );
  }

  return [...map.values()].sort((a, b) => {
    const av = a.updatedAt?.toMillis?.() ?? 0;
    const bv = b.updatedAt?.toMillis?.() ?? 0;
    return bv - av;
  });
}

export function mergeVisibleInboxThreads(
  previous: InboxChat[],
  live: InboxChat[],
  viewerUid = "",
  firestoreSynced = false,
) {
  const nextLive = dedupeInboxChats(live, viewerUid).filter(isVisibleInboxChat);
  if (firestoreSynced || previous.length === 0 || nextLive.length >= previous.length) {
    return nextLive;
  }
  return dedupeInboxChats([...previous, ...nextLive], viewerUid).filter(
    isVisibleInboxChat,
  );
}

export const UID_INBOX_QUERY_KEYS = [
  "participantes",
  "anonOwner",
  "receptor",
  "target",
] as const;

export const ANON_INBOX_QUERY_KEYS = [
  "anonParticipantes",
  "anonSession",
] as const;

/** Live inbox is complete only after every active query family has a first snapshot. */
export function areInboxQuerySnapshotsComplete(
  receivedKeys: Iterable<string>,
  activeFamilies: { uid?: boolean; anon?: boolean },
) {
  const received = new Set(
    [...receivedKeys].map((key) => String(key || "").trim()).filter(Boolean),
  );
  const required = [
    ...(activeFamilies.uid ? UID_INBOX_QUERY_KEYS : []),
    ...(activeFamilies.anon ? ANON_INBOX_QUERY_KEYS : []),
  ];
  return required.length > 0 && required.every((key) => received.has(key));
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
