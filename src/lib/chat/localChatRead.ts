import {
  chatActivityKey,
  collectViewerSenderIds,
} from "@/lib/chat/incomingChatActivity";
import type { InboxChat } from "@/hooks/useChatsInbox";

const READ_KEY = "sayittome_chat_read_local";
let localReadVersion = 0;

export function getLocalChatReadVersion() {
  return localReadVersion;
}

type ReadMap = Record<string, string>;

function readMap(): ReadMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: ReadMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify(map));
    localReadVersion += 1;
    window.dispatchEvent(new Event("sayittome-chat-read-local-changed"));
  } catch {
    // Ignore quota errors.
  }
}

function readCacheKey(chatId: string, viewerId: string) {
  return `${chatId}:${viewerId}`;
}

function readMessageCacheKey(messageId: string, viewerId: string) {
  return `message:${messageId}:${viewerId}`;
}

function readTextCacheKey(chatId: string, viewerId: string) {
  return `text:${chatId}:${viewerId}`;
}

// Anon-direct chats live in chats_anonimos and use Firebase Auth UID only.
// Keep their exact-message read markers separate from profile-anon identity
// aliases so a delayed Firestore snapshot cannot re-bold an opened row.
function anonDirectReadKey(chatId: string, viewerAuthUid: string) {
  return `anon-direct:${encodeURIComponent(viewerAuthUid)}:${encodeURIComponent(chatId)}`;
}

export function markAnonDirectReadLocally(
  chatId: string,
  viewerAuthUid: string,
  latestMessageId: string,
) {
  const id = String(chatId || "").trim();
  const uid = String(viewerAuthUid || "").trim();
  const messageId = String(latestMessageId || "").trim();
  if (!id || !uid || !messageId) return;
  const map = readMap();
  const key = anonDirectReadKey(id, uid);
  if (map[key] === messageId) return;
  map[key] = messageId;
  writeMap(map);
}

export function wasAnonDirectReadLocally(
  chatId: string,
  viewerAuthUid: string,
  latestMessageId: string,
) {
  const id = String(chatId || "").trim();
  const uid = String(viewerAuthUid || "").trim();
  const messageId = String(latestMessageId || "").trim();
  if (!id || !uid || !messageId) return false;
  return readMap()[anonDirectReadKey(id, uid)] === messageId;
}

function textActivityKey(chat: InboxChat) {
  return [chat.lastMessage || "", chat.lastMessageSender || ""].join("|");
}

export function markChatReadLocally(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
) {
  if (!viewerId && !firebaseUid) return;
  const chatId = chat.canonicalChatId || chat.id;
  const activityKey = chatActivityKey(chat);
  const textKey = textActivityKey(chat);
  const map = readMap();
  const viewerIds = collectViewerSenderIds(chat, viewerId || firebaseUid, firebaseUid);
  const latestMessageId = String(chat.latestMessageId || "").trim();
  for (const id of viewerIds) {
    map[readCacheKey(chatId, id)] = activityKey;
    if (chat.id !== chatId) map[readCacheKey(chat.id, id)] = activityKey;
    if (textKey !== "|") {
      map[readTextCacheKey(chatId, id)] = textKey;
      if (chat.id !== chatId) map[readTextCacheKey(chat.id, id)] = textKey;
    }
    if (latestMessageId) map[readMessageCacheKey(latestMessageId, id)] = "1";
  }
  writeMap(map);
}

export function wasChatReadLocally(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
) {
  const chatId = chat.canonicalChatId || chat.id;
  const activityKey = chatActivityKey(chat);
  const textKey = textActivityKey(chat);
  const map = readMap();
  const viewerIds = collectViewerSenderIds(chat, viewerId || firebaseUid, firebaseUid);
  const latestMessageId = String(chat.latestMessageId || "").trim();

  for (const id of viewerIds) {
    const stored =
      map[readCacheKey(chatId, id)] || map[readCacheKey(chat.id, id)] || "";
    if (stored && stored === activityKey) return true;

    // Message-id marker survives inbox rows that drop latestMessageId later
    // (forceAnonRecovery / preferInboxChat rewrite on tab return).
    if (latestMessageId && map[readMessageCacheKey(latestMessageId, id)]) {
      return true;
    }

    // An exact newer message ID overrides a coincidentally identical preview.
    // Two successive replies can say the same thing; text-only fallback must
    // never suppress the second one merely because their text/sender match.
    if (latestMessageId && stored.startsWith("id:") && stored !== `id:${latestMessageId}`) {
      continue;
    }

    // Text fallback: same preview identity as when the chat was opened/read.
    // A new inbound message changes lastMessage or sender and misses this.
    if (
      textKey !== "|" &&
      (map[readTextCacheKey(chatId, id)] === textKey ||
        map[readTextCacheKey(chat.id, id)] === textKey)
    ) {
      return true;
    }

    // Marked with id:msg while the row later only has text activityKey.
    if (stored.startsWith("id:") && textKey !== "|" && activityKey === textKey) {
      return true;
    }
  }
  return false;
}

export function subscribeLocalChatRead(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("sayittome-chat-read-local-changed", callback);
  return () => window.removeEventListener("sayittome-chat-read-local-changed", callback);
}

export function clearLocalChatReadForViewer(viewerId: string) {
  if (!viewerId || typeof window === "undefined") return;
  const map = readMap();
  const suffix = `:${viewerId}`;
  let changed = false;
  for (const key of Object.keys(map)) {
    if (key.endsWith(suffix)) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) writeMap(map);
}
