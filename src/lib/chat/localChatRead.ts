import { chatActivityKey } from "@/lib/chat/incomingChatActivity";
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
    const raw = sessionStorage.getItem(READ_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: ReadMap) {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(READ_KEY, JSON.stringify(map));
    localReadVersion += 1;
    window.dispatchEvent(new Event("sayittome-chat-read-local-changed"));
  } catch {
    // Ignore quota errors.
  }
}

function readCacheKey(chatId: string, viewerId: string) {
  return `${chatId}:${viewerId}`;
}

export function markChatReadLocally(chat: InboxChat, viewerId: string) {
  if (!viewerId) return;
  const chatId = chat.canonicalChatId || chat.id;
  const map = readMap();
  map[readCacheKey(chatId, viewerId)] = chatActivityKey(chat);
  if (chat.id !== chatId) {
    map[readCacheKey(chat.id, viewerId)] = chatActivityKey(chat);
  }
  writeMap(map);
}

export function wasChatReadLocally(chat: InboxChat, viewerId: string) {
  if (!viewerId) return false;
  const chatId = chat.canonicalChatId || chat.id;
  const activityKey = chatActivityKey(chat);
  const map = readMap();
  return (
    map[readCacheKey(chatId, viewerId)] === activityKey ||
    map[readCacheKey(chat.id, viewerId)] === activityKey
  );
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
