import { isNativeAppShell } from "@/lib/app/nativeShell";
import { markChatsInboxHydrated } from "@/hooks/useChatsInboxReady";

const SESSION_CHATS_KEY = "sayittome_session_chats";
const NATIVE_SESSION_CHATS_KEY = "sayittome_native_session_chats";
export const SESSION_CHATS_CHANGED_EVENT = "sayittome-session-chats-changed";
export const SESSION_CHAT_REMOVED_EVENT = "sayittome-session-chat-removed";

function notifySessionChatsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_CHATS_CHANGED_EVENT));
}

export function getSessionChatIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    let raw = sessionStorage.getItem(SESSION_CHATS_KEY);

    // Android/WebView renderer recreation wipes sessionStorage but preserves
    // localStorage. Restore the volatile registry so inbox rows come back
    // immediately; the server recovery remains a secondary safety net.
    if (!raw && isNativeAppShell()) {
      const persisted = localStorage.getItem(NATIVE_SESSION_CHATS_KEY);
      if (persisted) {
        raw = persisted;
        sessionStorage.setItem(SESSION_CHATS_KEY, persisted);
      }
    }

    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const ids = parsed.filter(
      (id) => typeof id === "string" && id.length > 0,
    );

    // Migration/backfill for native sessions created before the persistent
    // mirror existed. The currently-live session registry wins.
    if (isNativeAppShell() && ids.length > 0) {
      const encoded = JSON.stringify(ids);
      if (localStorage.getItem(NATIVE_SESSION_CHATS_KEY) !== encoded) {
        localStorage.setItem(NATIVE_SESSION_CHATS_KEY, encoded);
      }
    }

    return ids;
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
      if (isNativeAppShell()) localStorage.removeItem(NATIVE_SESSION_CHATS_KEY);
    } else {
      const encoded = JSON.stringify(current);
      sessionStorage.setItem(SESSION_CHATS_KEY, encoded);
      if (isNativeAppShell()) localStorage.setItem(NATIVE_SESSION_CHATS_KEY, encoded);
    }
  } catch {}

  window.dispatchEvent(
    new CustomEvent(SESSION_CHAT_REMOVED_EVENT, { detail: { chatId } }),
  );
  notifySessionChatsChanged();
}

export function registerSessionChat(chatId: string) {
  if (typeof window === "undefined" || !chatId) return;

  markChatsInboxHydrated(1);

  const current = getSessionChatIds();
  if (current.includes(chatId)) return;

  try {
    const encoded = JSON.stringify([chatId, ...current]);
    sessionStorage.setItem(SESSION_CHATS_KEY, encoded);
    if (isNativeAppShell()) {
      localStorage.setItem(NATIVE_SESSION_CHATS_KEY, encoded);
    }
  } catch {}

  notifySessionChatsChanged();
}

/**
 * Reuse a session profile-anon thread only when live anon matches the chatId sender.
 * After logout rotation, live anon ≠ old sender → return "" → new chat for receptor.
 */
export function findSessionProfileChatIdForUsername(
  username: string,
  liveAnonId = "",
) {
  const needle = String(username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 80);
  if (!needle) return "";
  const live = String(liveAnonId || "").trim();
  const marker = "__anon_to__";
  for (const chatId of getSessionChatIds()) {
    const id = String(chatId || "");
    if (!id.includes(marker)) continue;
    const [sender = "", target = ""] = id.split(marker);
    if (target !== needle) continue;
    if (!sender.startsWith("anon_")) continue;
    if (live.startsWith("anon_") && sender !== live) continue;
    if (!live.startsWith("anon_")) continue;
    return id;
  }
  return "";
}

export function clearSessionChats() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_CHATS_KEY);
  try {
    localStorage.removeItem(NATIVE_SESSION_CHATS_KEY);
  } catch {}
  notifySessionChatsChanged();
}
