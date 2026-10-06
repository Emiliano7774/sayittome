"use client";

const CHANGE_EVENT = "sayittome:local-pending-chats";

const pending = new Set<string>();
let version = 0;

function emit() {
  version += 1;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function cleanId(chatId: string) {
  return String(chatId || "").trim();
}

/** Whip saw a live inbound message — paint the orange tick before inbox meta catches up. */
export function markLocalPendingChat(chatId: string) {
  const id = cleanId(chatId);
  if (!id || pending.has(id)) return;
  pending.add(id);
  emit();
}

export function clearLocalPendingChat(chatId: string) {
  const id = cleanId(chatId);
  if (!id || !pending.has(id)) return;
  pending.delete(id);
  emit();
}

export function clearAllLocalPendingChats() {
  if (pending.size === 0) return;
  pending.clear();
  emit();
}

export function getLocalPendingChatIds() {
  return [...pending];
}

export function countLocalPendingChats(excludeChatId = "") {
  const exclude = cleanId(excludeChatId);
  if (!exclude) return pending.size;
  let n = 0;
  for (const id of pending) {
    if (id !== exclude) n += 1;
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
  return `${version}:${[...pending].join("|")}`;
}
