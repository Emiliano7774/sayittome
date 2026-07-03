import type { InboxChat } from "@/hooks/useChatsInbox";

const STORAGE_KEY = "sayittome:inbox-snapshot:v1";
const MAX_ROWS = 50;

type StoredInboxRow = Omit<InboxChat, "updatedAt"> & {
  updatedAtMs?: number;
};

let memorySnapshot: InboxChat[] = [];

function inboxUpdatedAtMs(chat: InboxChat) {
  return chat.updatedAt?.toMillis?.() ?? 0;
}

function rowFromChat(chat: InboxChat): StoredInboxRow {
  const updatedAtMs = inboxUpdatedAtMs(chat);
  const { updatedAt: _updatedAt, ...rest } = chat;
  return updatedAtMs > 0 ? { ...rest, updatedAtMs } : rest;
}

function chatFromRow(row: StoredInboxRow): InboxChat {
  const { updatedAtMs, ...rest } = row;
  return {
    ...rest,
    ...(updatedAtMs
      ? { updatedAt: { toMillis: () => updatedAtMs } }
      : {}),
  };
}

export function readInboxSnapshot(): InboxChat[] {
  if (memorySnapshot.length > 0) return memorySnapshot;
  if (typeof window === "undefined") return [];

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredInboxRow[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    memorySnapshot = parsed.map(chatFromRow);
    return memorySnapshot;
  } catch {
    return [];
  }
}

export function writeInboxSnapshot(chats: InboxChat[]) {
  if (chats.length === 0) return;

  const trimmed = chats.slice(0, MAX_ROWS);
  memorySnapshot = trimmed;

  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(trimmed.map(rowFromChat)),
    );
  } catch {
    // sessionStorage full or unavailable
  }
}
