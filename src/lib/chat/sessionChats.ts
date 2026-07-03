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

export function clearSessionChats() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_CHATS_KEY);
  notifySessionChatsChanged();
}
