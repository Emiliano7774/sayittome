const alertedKeys = new Set<string>();
const MAX_ALERTED_KEYS = 600;
const STORAGE_KEY = "sayittome_whip_alerted_v1";

function alertKey(chatId: string, messageId: string) {
  return `${chatId}:${messageId}`;
}

function readStoredKeys(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((key) => typeof key === "string" && key.includes(":"))
      : [];
  } catch {
    return [];
  }
}

function persistAlertedKeys() {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...alertedKeys]));
  } catch {
    // Ignore quota errors.
  }
}

function ensureLoaded() {
  if (alertedKeys.size > 0) return;

  for (const key of readStoredKeys()) {
    alertedKeys.add(key);
  }
}

function trimAlertedKeys() {
  if (alertedKeys.size <= MAX_ALERTED_KEYS) return;
  const drop = alertedKeys.size - MAX_ALERTED_KEYS;
  let removed = 0;
  for (const key of alertedKeys) {
    alertedKeys.delete(key);
    removed += 1;
    if (removed >= drop) break;
  }
}

export function wasMessageWhipAlerted(chatId: string, messageId: string) {
  if (!chatId || !messageId) return false;
  ensureLoaded();
  return alertedKeys.has(alertKey(chatId, messageId));
}

export function markMessageWhipAlerted(chatId: string, messageId: string) {
  if (!chatId || !messageId) return;
  ensureLoaded();
  alertedKeys.add(alertKey(chatId, messageId));
  trimAlertedKeys();
  persistAlertedKeys();
}

export function markChatMessagesWhipAlerted(chatId: string, messageIds: string[]) {
  if (!chatId || messageIds.length === 0) return;
  ensureLoaded();

  let changed = false;
  for (const messageId of messageIds) {
    const key = alertKey(chatId, messageId);
    if (!messageId || alertedKeys.has(key)) continue;
    alertedKeys.add(key);
    changed = true;
  }

  if (!changed) return;
  trimAlertedKeys();
  persistAlertedKeys();
}

export function tryAlertIncomingMessage(input: {
  chatId: string;
  messageId: string;
  incoming: boolean;
  suppress: boolean;
  onAlert: () => void;
}) {
  const { chatId, messageId, incoming, suppress, onAlert } = input;
  if (!chatId || !messageId) return false;
  if (wasMessageWhipAlerted(chatId, messageId)) return false;

  // A global listener suppresses alerts while the exact detail is visible.
  // Do not consume that doc id there: the detail listener is the alert owner
  // and must still emit one whip for every newly rendered inbound message.
  if (incoming && suppress) return false;

  markMessageWhipAlerted(chatId, messageId);
  if (!incoming) return false;

  onAlert();
  return true;
}
