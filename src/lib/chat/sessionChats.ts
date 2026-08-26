import { markChatsInboxHydrated } from "@/hooks/useChatsInboxReady";

const SESSION_CHATS_KEY = "sayittome_session_chats";
export const SESSION_CHATS_CHANGED_EVENT = "sayittome-session-chats-changed";

function notifySessionChatsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_CHATS_CHANGED_EVENT));
}

export function getSessionChatIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = sessionStorage.getItem(SESSION_CHATS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === "string" && id.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function unregisterSessionChat(chatId: string) {
  if (typeof window === "undefined" || !chatId) return;

  const current = getSessionChatIds().filter((id) => id !== chatId);

  try {
    if (current.length === 0) {
      sessionStorage.removeItem(SESSION_CHATS_KEY);
    } else {
      sessionStorage.setItem(SESSION_CHATS_KEY, JSON.stringify(current));
    }
  } catch {}

  notifySessionChatsChanged();
}

export function registerSessionChat(chatId: string) {
  if (typeof window === "undefined" || !chatId) return;

  markChatsInboxHydrated(1);

  const current = getSessionChatIds();
  if (current.includes(chatId)) return;

  try {
    sessionStorage.setItem(
      SESSION_CHATS_KEY,
      JSON.stringify([chatId, ...current].slice(0, 40)),
    );
  } catch {}

  notifySessionChatsChanged();
}

/** Existing profile-anon thread for a username (preserves chatId across anon rotation). */
export function findSessionProfileChatIdForUsername(username: string) {
  const needle = String(username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 80);
  if (!needle) return "";
  const marker = "__anon_to__";
  for (const chatId of getSessionChatIds()) {
    const id = String(chatId || "");
    if (!id.includes(marker)) continue;
    const target = id.split(marker)[1] || "";
    if (target === needle) return id;
  }
  return "";
}

export function clearSessionChats() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_CHATS_KEY);
  notifySessionChatsChanged();
}
