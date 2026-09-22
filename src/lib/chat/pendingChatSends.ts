const pendingChatSends = new Set<Promise<unknown>>();

const INTERRUPTED_SEND_KEY = "sayittome:pending-chat-send:v1";
const PENDING_SENDS_KEY = "sayittome:pending-chat-sends:v2";
const RECENT_INTERRUPTED_SEND_MS = 60_000;
export const PENDING_CHAT_SEND_WAIT_MS = 12_000;

type PendingChatSendEntry = {
  chatId: string;
  clientId: string;
  startedAt: number;
};

function storagePairs() {
  if (typeof window === "undefined") return [];
  return [window.sessionStorage, window.localStorage];
}

function readRawEntries(): PendingChatSendEntry[] {
  if (typeof window === "undefined") return [];
  for (const storage of storagePairs()) {
    try {
      const raw = storage.getItem(PENDING_SENDS_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      return parsed
        .map((row) => {
          const entry = row as Partial<PendingChatSendEntry>;
          return {
            chatId: String(entry.chatId || "").trim(),
            clientId: String(entry.clientId || "").trim(),
            startedAt: Number(entry.startedAt || 0),
          };
        })
        .filter((entry) => entry.chatId && Number.isFinite(entry.startedAt) && entry.startedAt > 0);
    } catch {
      // try the other store
    }
  }
  return [];
}

function writeEntries(entries: PendingChatSendEntry[]) {
  const encoded = entries.length > 0 ? JSON.stringify(entries) : "";
  for (const storage of storagePairs()) {
    try {
      if (!encoded) storage.removeItem(PENDING_SENDS_KEY);
      else storage.setItem(PENDING_SENDS_KEY, encoded);
    } catch {
      // storage unavailable
    }
  }
}

function freshEntries(maxAgeMs = RECENT_INTERRUPTED_SEND_MS, now = Date.now()) {
  const fresh = readRawEntries().filter(
    (entry) => now - entry.startedAt >= 0 && now - entry.startedAt <= maxAgeMs,
  );
  if (fresh.length !== readRawEntries().length) writeEntries(fresh);
  return fresh;
}

function writeLegacyMarker(now = Date.now()) {
  const value = String(now);
  for (const storage of storagePairs()) {
    try {
      storage.setItem(INTERRUPTED_SEND_KEY, value);
    } catch {
      // storage unavailable
    }
  }
}

function syncDurableMarker() {
  const entries = freshEntries();
  if (pendingChatSends.size > 0 || entries.length > 0) {
    writeLegacyMarker();
    return;
  }
  clearInterruptedChatSendMarker();
}

export function clearInterruptedChatSendMarker() {
  for (const storage of storagePairs()) {
    try {
      storage.removeItem(INTERRUPTED_SEND_KEY);
      storage.removeItem(PENDING_SENDS_KEY);
    } catch {
      // storage unavailable
    }
  }
}

export function rememberPendingChatSend(input: { chatId?: string; clientId?: string }) {
  const chatId = String(input.chatId || "").trim();
  if (!chatId || typeof window === "undefined") return;
  const clientId = String(input.clientId || "").trim();
  const now = Date.now();
  const entries = freshEntries(RECENT_INTERRUPTED_SEND_MS, now).filter(
    (entry) => !(entry.chatId === chatId && entry.clientId === clientId),
  );
  entries.push({ chatId, clientId, startedAt: now });
  writeEntries(entries);
  writeLegacyMarker(now);
}

export function forgetPendingChatSend(input: { chatId?: string; clientId?: string }) {
  const chatId = String(input.chatId || "").trim();
  if (!chatId) {
    syncDurableMarker();
    return;
  }
  const clientId = String(input.clientId || "").trim();
  const entries = freshEntries().filter((entry) => {
    if (entry.chatId !== chatId) return true;
    if (!clientId) return false;
    return entry.clientId !== clientId;
  });
  writeEntries(entries);
  syncDurableMarker();
}

export function listPendingChatSendIds(maxAgeMs = RECENT_INTERRUPTED_SEND_MS) {
  return [...new Set(freshEntries(maxAgeMs).map((entry) => entry.chatId))];
}

export function hadRecentInterruptedChatSend(maxAgeMs = RECENT_INTERRUPTED_SEND_MS) {
  if (listPendingChatSendIds(maxAgeMs).length > 0) return true;
  if (typeof window === "undefined") return false;
  let raw = "";
  for (const storage of storagePairs()) {
    try {
      raw = storage.getItem(INTERRUPTED_SEND_KEY) || "";
    } catch {
      raw = "";
    }
    if (raw) break;
  }
  const startedAt = Number(raw || 0);
  const recent =
    Number.isFinite(startedAt) &&
    startedAt > 0 &&
    Date.now() - startedAt >= 0 &&
    Date.now() - startedAt <= maxAgeMs;
  if (!recent && raw) clearInterruptedChatSendMarker();
  return recent;
}

export function trackPendingChatSend<T>(
  promise: Promise<T>,
  meta?: { chatId?: string; clientId?: string },
): Promise<T> {
  pendingChatSends.add(promise);
  if (meta?.chatId) rememberPendingChatSend(meta);
  else writeLegacyMarker();
  void promise
    .finally(() => {
      pendingChatSends.delete(promise);
      syncDurableMarker();
    })
    .catch(() => undefined);
  return promise;
}

export function hasPendingChatSends() {
  return pendingChatSends.size > 0;
}

export async function waitForPendingChatSends(timeoutMs = PENDING_CHAT_SEND_WAIT_MS) {
  const started = Date.now();
  while (pendingChatSends.size > 0) {
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) return;
    const snapshot = Array.from(pendingChatSends);
    await Promise.race([
      Promise.allSettled(snapshot),
      new Promise((resolve) => setTimeout(resolve, remaining)),
    ]);
  }
}
