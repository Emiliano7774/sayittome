import {
  enqueueMessageDelete,
  queuedDeletesForIdentity,
  removeQueuedMessageDelete,
  type QueuedMessageDelete,
} from "@/lib/chat/messageDelete";

const HIDDEN_PREFIX = "sayittome:hidden-msgs:v1:";
const QUEUE_KEY = "sayittome:delete-ops:v1";

function storage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readLocalHiddenMessageIds(chatId: string): string[] {
  const raw = storage()?.getItem(`${HIDDEN_PREFIX}${chatId}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((id) => String(id)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function rememberLocalHiddenMessage(chatId: string, messageId: string) {
  const ids = new Set(readLocalHiddenMessageIds(chatId));
  ids.add(messageId);
  storage()?.setItem(`${HIDDEN_PREFIX}${chatId}`, JSON.stringify([...ids]));
}

export function forgetLocalHiddenMessage(chatId: string, messageId: string) {
  const ids = readLocalHiddenMessageIds(chatId).filter((id) => id !== messageId);
  storage()?.setItem(`${HIDDEN_PREFIX}${chatId}`, JSON.stringify(ids));
}

export function readQueuedMessageDeletes(identity?: string): QueuedMessageDelete[] {
  const raw = storage()?.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const queue = Array.isArray(parsed) ? (parsed as QueuedMessageDelete[]) : [];
    if (identity === undefined) return queue;
    return queuedDeletesForIdentity(queue, identity);
  } catch {
    return [];
  }
}

export function writeQueuedMessageDeletes(queue: QueuedMessageDelete[]) {
  storage()?.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function queueMessageDelete(next: Omit<QueuedMessageDelete, "attempts">) {
  const queue = enqueueMessageDelete(readQueuedMessageDeletes(), next);
  writeQueuedMessageDeletes(queue);
  return queue;
}

export function dequeueMessageDelete(id: string) {
  writeQueuedMessageDeletes(removeQueuedMessageDelete(readQueuedMessageDeletes(), id));
}
