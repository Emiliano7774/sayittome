import type { InboxChat } from "@/hooks/useChatsInbox";

const STORAGE_KEY = "sayittome:deleted-inbox-chats:v1";
const MAX_IDS = 400;
const ids = new Set<string>();
let loaded = false;

function rememberStorage(encoded: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, encoded);
  } catch {
    /* private mode */
  }
  try {
    localStorage.setItem(STORAGE_KEY, encoded);
  } catch {
    /* private mode */
  }
}

function loadDeletedInboxChats() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || "[]";
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const id of parsed) {
      if (typeof id === "string" && id) ids.add(id);
    }
  } catch {
    /* ignore corrupt cache */
  }
}

export function rememberDeletedInboxChats(chatIds: string[]) {
  loadDeletedInboxChats();
  let changed = false;
  for (const id of chatIds) {
    const chatId = String(id || "").trim();
    if (!chatId || ids.has(chatId)) continue;
    ids.add(chatId);
    changed = true;
  }
  if (!changed || typeof window === "undefined") return;
  const encoded = JSON.stringify([...ids].slice(-MAX_IDS));
  rememberStorage(encoded);
}

export function isDeletedInboxChatId(chatId: string) {
  loadDeletedInboxChats();
  const id = String(chatId || "").trim();
  return Boolean(id && ids.has(id));
}

export function isDeletedInboxChat(chat: Pick<InboxChat, "id" | "canonicalChatId">) {
  return isDeletedInboxChatId(chat.id) || isDeletedInboxChatId(chat.canonicalChatId || "");
}

export function withoutDeletedInboxChats<T extends Pick<InboxChat, "id" | "canonicalChatId">>(
  chats: T[],
) {
  return chats.filter((chat) => !isDeletedInboxChat(chat));
}
