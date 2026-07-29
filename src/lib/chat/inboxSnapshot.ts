import type { InboxChat } from "@/hooks/useChatsInbox";

const STORAGE_KEY = "sayittome:inbox-snapshot:v1";
const MAX_ROWS = 50;

type StoredInboxRow = Omit<InboxChat, "updatedAt"> & {
  updatedAtMs?: number;
  lastMessageAtMs?: number;
  readAtMs?: Record<string, number>;
};

let memorySnapshot: InboxChat[] = [];
let firstInboxSnapshotReadMeta: InboxSnapshotReadMeta | null = null;

export function resetInboxSnapshotReadTrace() {
  firstInboxSnapshotReadMeta = null;
}

export function peekFirstInboxSnapshotReadMeta() {
  return firstInboxSnapshotReadMeta;
}

function recordFirstInboxSnapshotReadMeta(meta: InboxSnapshotReadMeta) {
  if (firstInboxSnapshotReadMeta === null) {
    firstInboxSnapshotReadMeta = meta;
  }
}

function inboxUpdatedAtMs(chat: InboxChat) {
  return chat.updatedAt?.toMillis?.() ?? 0;
}

function rowFromChat(chat: InboxChat): StoredInboxRow {
  const updatedAtMs = inboxUpdatedAtMs(chat);
  const lastMessageAtMs = chat.lastMessageAt?.toMillis?.() ?? 0;
  const readAtMs = Object.fromEntries(
    Object.entries(chat.readAt || {})
      .map(([key, value]) => [
        key,
        typeof (value as { toMillis?: () => number })?.toMillis === "function"
          ? (value as { toMillis: () => number }).toMillis()
          : 0,
      ])
      .filter(([, value]) => Number(value) > 0),
  ) as Record<string, number>;
  const {
    updatedAt: _updatedAt,
    lastMessageAt: _lastMessageAt,
    readAt: _readAt,
    ...rest
  } = chat;
  return {
    ...rest,
    ...(updatedAtMs > 0 ? { updatedAtMs } : {}),
    ...(lastMessageAtMs > 0 ? { lastMessageAtMs } : {}),
    ...(Object.keys(readAtMs).length > 0 ? { readAtMs } : {}),
  };
}

function chatFromRow(row: StoredInboxRow): InboxChat {
  const { updatedAtMs, lastMessageAtMs, readAtMs, ...rest } = row;
  return {
    ...rest,
    ...(updatedAtMs
      ? { updatedAt: { toMillis: () => updatedAtMs } }
      : {}),
    ...(lastMessageAtMs
      ? { lastMessageAt: { toMillis: () => lastMessageAtMs } }
      : {}),
    ...(readAtMs
      ? {
          readAt: Object.fromEntries(
            Object.entries(readAtMs).map(([key, value]) => [
              key,
              { toMillis: () => value },
            ]),
          ),
        }
      : {}),
  };
}

export function clearInboxSnapshotCache() {
  memorySnapshot = [];
  resetInboxSnapshotReadTrace();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export function clearInboxMemoryCacheOnly() {
  memorySnapshot = [];
  resetInboxSnapshotReadTrace();
}

export type InboxSnapshotReadMeta = {
  source: "memory" | "session" | "none";
  parseMs: number;
  bytes: number;
  count: number;
  accepted: boolean;
};

export function readInboxSnapshotWithMeta(): {
  chats: InboxChat[];
  meta: InboxSnapshotReadMeta;
} {
  const hadMemory = memorySnapshot.length > 0;

  if (hadMemory) {
    const meta: InboxSnapshotReadMeta = {
      source: "memory",
      parseMs: 0,
      bytes: 0,
      count: memorySnapshot.length,
      accepted: true,
    };
    return { chats: memorySnapshot, meta };
  }

  if (typeof window === "undefined") {
    const meta: InboxSnapshotReadMeta = {
      source: "none",
      parseMs: 0,
      bytes: 0,
      count: 0,
      accepted: false,
    };
    recordFirstInboxSnapshotReadMeta(meta);
    return { chats: [], meta };
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const meta: InboxSnapshotReadMeta = {
        source: "none",
        parseMs: 0,
        bytes: 0,
        count: 0,
        accepted: false,
      };
      recordFirstInboxSnapshotReadMeta(meta);
      return { chats: [], meta };
    }

    const bytes = raw.length * 2;
    const parseStart = performance.now();
    const parsed = JSON.parse(raw) as StoredInboxRow[];
    const parseMs = Math.round(performance.now() - parseStart);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      const meta: InboxSnapshotReadMeta = {
        source: "session",
        parseMs,
        bytes,
        count: 0,
        accepted: false,
      };
      recordFirstInboxSnapshotReadMeta(meta);
      return { chats: [], meta };
    }

    memorySnapshot = parsed.map(chatFromRow);
    const meta: InboxSnapshotReadMeta = {
      source: "session",
      parseMs,
      bytes,
      count: memorySnapshot.length,
      accepted: true,
    };
    recordFirstInboxSnapshotReadMeta(meta);
    return { chats: memorySnapshot, meta };
  } catch {
    const meta: InboxSnapshotReadMeta = {
      source: "session",
      parseMs: 0,
      bytes: 0,
      count: 0,
      accepted: false,
    };
    recordFirstInboxSnapshotReadMeta(meta);
    return { chats: [], meta };
  }
}

export function readInboxSnapshot(): InboxChat[] {
  return readInboxSnapshotWithMeta().chats;
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
