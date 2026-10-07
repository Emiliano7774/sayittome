"use client";

const CHANGE_EVENT = "sayittome:local-pending-chats";
/** Whip can mark before inbox meta catches up — don't reconcile-clear inside this window. */
const RECONCILE_GRACE_MS = 2500;

type PendingEntry = { markedAt: number };

const pending = new Map<string, PendingEntry>();
let version = 0;

function emit() {
  version += 1;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function cleanId(chatId: string) {
  return String(chatId || "").trim();
}

function collectIds(chatIds: Array<string | null | undefined>) {
  const ids = new Set<string>();
  for (const raw of chatIds) {
    const id = cleanId(raw || "");
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Whip saw a live inbound message — paint the orange tick before inbox meta catches up. */
export function markLocalPendingChat(chatId: string) {
  const id = cleanId(chatId);
  if (!id || pending.has(id)) return;
  pending.set(id, { markedAt: Date.now() });
  emit();
}

export function clearLocalPendingChat(chatId: string) {
  const id = cleanId(chatId);
  if (!id || !pending.has(id)) return;
  pending.delete(id);
  emit();
}

/** Clear every known id for a thread (URL id + canonical + inbox row id). */
export function clearLocalPendingChatsForThread(
  ...chatIds: Array<string | null | undefined>
) {
  const ids = collectIds(chatIds);
  if (ids.length === 0) return;
  let changed = false;
  for (const id of ids) {
    if (pending.delete(id)) changed = true;
  }
  if (changed) emit();
}

export function clearAllLocalPendingChats() {
  if (pending.size === 0) return;
  pending.clear();
  emit();
}

/**
 * Drop latched pending ids once inbox says they are read.
 * Skips entries younger than RECONCILE_GRACE_MS so whip→inbox lag does not
 * wipe the orange tick before unreadCounts / localRead catch up.
 */
export function reconcileLocalPendingChats(
  isStillUnread: (chatId: string) => boolean | null,
  now = Date.now(),
  graceMs = RECONCILE_GRACE_MS,
) {
  if (pending.size === 0) return;
  let changed = false;
  for (const [id, entry] of pending) {
    if (now - entry.markedAt < graceMs) continue;
    const still = isStillUnread(id);
    if (still === false) {
      pending.delete(id);
      changed = true;
    }
  }
  if (changed) emit();
}

export function getLocalPendingChatIds() {
  return [...pending.keys()];
}

export function countLocalPendingChats(
  ...excludeChatIds: Array<string | null | undefined>
) {
  const excludes = new Set(collectIds(excludeChatIds));
  if (excludes.size === 0) return pending.size;
  let n = 0;
  for (const id of pending.keys()) {
    if (!excludes.has(id)) n += 1;
  }
  return n;
}

export function subscribeLocalPendingChats(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

export function getLocalPendingChatsVersion() {
  return `${version}:${[...pending.keys()].join("|")}`;
}
