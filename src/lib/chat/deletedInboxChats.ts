import type { InboxChat } from "@/hooks/useChatsInbox";

const STORAGE_KEY = "sayittome:deleted-inbox-chats:v1";
const MAX_IDS = 400;
const tombstones = new Map<string, number>();
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

function persistTombstones() {
  if (typeof window === "undefined") return;
  const entries = [...tombstones.entries()].slice(-MAX_IDS);
  rememberStorage(JSON.stringify(Object.fromEntries(entries)));
}

function loadDeletedInboxChats() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || "[]";
    const parsed = JSON.parse(raw) as unknown;
    const now = Date.now();
    if (Array.isArray(parsed)) {
      for (const id of parsed) {
        if (typeof id === "string" && id) tombstones.set(id, now);
      }
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      const chatId = String(id || "").trim();
      const when = Number(at);
      if (chatId && Number.isFinite(when) && when > 0) tombstones.set(chatId, when);
    }
  } catch {
    /* ignore corrupt cache */
  }
}

export function rememberDeletedInboxChats(chatIds: string[], at = Date.now()) {
  loadDeletedInboxChats();
  const when = Number(at) || Date.now();
  let changed = false;
  for (const id of chatIds) {
    const chatId = String(id || "").trim();
    if (!chatId) continue;
    tombstones.set(chatId, when);
    changed = true;
  }
  if (changed) persistTombstones();
}

export function deletedInboxTombstoneAt(chatId: string) {
  loadDeletedInboxChats();
  const id = String(chatId || "").trim();
  return id ? tombstones.get(id) || 0 : 0;
}

export function isDeletedInboxChatId(chatId: string) {
  return deletedInboxTombstoneAt(chatId) > 0;
}

export function isMessageClearedByInboxDelete(chatId: string, createdAtMs?: number) {
  const at = deletedInboxTombstoneAt(chatId);
  if (!at) return false;
  const created = Number(createdAtMs) || 0;
  if (!created) return true;
  return created < at;
}

function inboxActivityMs(chat: Pick<InboxChat, "updatedAt" | "lastMessageAt" | "createdAtMs">) {
  const updated = Number(chat.updatedAt?.toMillis?.() || 0);
  if (updated) return updated;
  const last = Number(chat.lastMessageAt?.toMillis?.() || 0);
  if (last) return last;
  return Number(chat.createdAtMs || 0);
}

export function isDeletedInboxChat(chat: Pick<InboxChat, "id" | "canonicalChatId" | "updatedAt" | "lastMessageAt" | "createdAtMs">) {
  const ids = [chat.id, chat.canonicalChatId || ""];
  const at = Math.max(...ids.map((id) => deletedInboxTombstoneAt(id)));
  if (!at) return false;
  return inboxActivityMs(chat) < at;
}

export function withoutDeletedInboxChats<T extends Pick<InboxChat, "id" | "canonicalChatId" | "updatedAt" | "lastMessageAt" | "createdAtMs">>(
  chats: T[],
) {
  return chats.filter((chat) => !isDeletedInboxChat(chat));
}
