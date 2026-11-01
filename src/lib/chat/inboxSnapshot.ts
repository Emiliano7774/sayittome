import type { InboxChat } from "@/hooks/useChatsInbox";
import { isNativeAppShell } from "@/lib/app/nativeShell";

const STORAGE_KEY = "sayittome:inbox-snapshot:v1";
const NATIVE_STORAGE_KEY = "sayittome:inbox-snapshot-native:v1";
const MAX_ROWS = 500;

type StoredInboxRow = Omit<InboxChat, "updatedAt"> & {
  updatedAtMs?: number;
  lastMessageAtMs?: number;
  readAtMs?: Record<string, number>;
};

let memorySnapshot: InboxChat[] = [];
let firstInboxSnapshotReadMeta: InboxSnapshotReadMeta | null = null;

// Firestore can deliver several inbox snapshots in a single short burst.
// Keep the live in-memory view immediate while coalescing JSON serialization
// and the two synchronous Storage writes off the listener-to-paint path.
let pendingSnapshotPersist: InboxChat[] | null = null;
let snapshotPersistScheduled = false;
let pagehideFlushInstalled = false;

function flushInboxSnapshotPersist() {
  snapshotPersistScheduled = false;
  const pending = pendingSnapshotPersist;
  pendingSnapshotPersist = null;
  if (!pending || typeof window === "undefined") return;
  try {
    const encoded = JSON.stringify(pending.map(rowFromChat));
    window.sessionStorage.setItem(STORAGE_KEY, encoded);
    if (isNativeAppShell()) window.localStorage.setItem(NATIVE_STORAGE_KEY, encoded);
  } catch {
    // Storage can be full or disabled; memory + live Firestore remain valid.
  }
}

function scheduleInboxSnapshotPersist(chats: InboxChat[]) {
  if (typeof window === "undefined") return;
  pendingSnapshotPersist = chats;
  if (!pagehideFlushInstalled) {
    pagehideFlushInstalled = true;
    // Preserve latest warm-open data on immediate navigation/closing the tab.
    window.addEventListener("pagehide", flushInboxSnapshotPersist);
  }
  if (snapshotPersistScheduled) return;
  snapshotPersistScheduled = true;
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(flushInboxSnapshotPersist, { timeout: 200 });
  } else {
    window.setTimeout(flushInboxSnapshotPersist, 32);
  }
}

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
  // Cancel any stale deferred write so a logout/deletion cannot resurrect rows.
  pendingSnapshotPersist = null;
  memorySnapshot = [];
  resetInboxSnapshotReadTrace();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(NATIVE_STORAGE_KEY);
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
  source: "memory" | "session" | "native" | "none";
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
    let source: InboxSnapshotReadMeta["source"] = "session";
    let raw = window.sessionStorage.getItem(STORAGE_KEY);

    if (!raw && isNativeAppShell()) {
      const persisted = window.localStorage.getItem(NATIVE_STORAGE_KEY);
      if (persisted) {
        raw = persisted;
        source = "native";
        window.sessionStorage.setItem(STORAGE_KEY, persisted);
      }
    }

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
        source,
        parseMs,
        bytes,
        count: 0,
        accepted: false,
      };
      recordFirstInboxSnapshotReadMeta(meta);
      return { chats: [], meta };
    }

    memorySnapshot = parsed.map(chatFromRow);
    if (isNativeAppShell()) {
      try {
        if (window.localStorage.getItem(NATIVE_STORAGE_KEY) !== raw) {
          window.localStorage.setItem(NATIVE_STORAGE_KEY, raw);
        }
      } catch {}
    }

    const meta: InboxSnapshotReadMeta = {
      source,
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
  if (chats.length === 0) {
    clearInboxSnapshotCache();
    return;
  }

  const trimmed = chats.slice(0, MAX_ROWS);
  memorySnapshot = trimmed;

  if (typeof window === "undefined") return;

  scheduleInboxSnapshotPersist(trimmed);
}

export function removeInboxSnapshotChat(chatId: string) {
  const cleanId = String(chatId || "").trim();
  if (!cleanId) return;

  // Deletion is rare and must persist immediately; invalidate an older batch.
  pendingSnapshotPersist = null;
  memorySnapshot = memorySnapshot.filter(
    (chat) => chat.id !== cleanId && chat.canonicalChatId !== cleanId,
  );

  if (typeof window === "undefined") return;

  try {
    if (memorySnapshot.length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(NATIVE_STORAGE_KEY);
      return;
    }

    const encoded = JSON.stringify(memorySnapshot.slice(0, MAX_ROWS).map(rowFromChat));
    window.sessionStorage.setItem(STORAGE_KEY, encoded);
    if (isNativeAppShell()) {
      window.localStorage.setItem(NATIVE_STORAGE_KEY, encoded);
    }
  } catch {
    // storage full or unavailable
  }
}
