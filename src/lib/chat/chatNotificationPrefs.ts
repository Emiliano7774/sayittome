"use client";

const STORAGE_KEY = "sayittome-chat-notification-prefs";
const CHANGE_EVENT = "sayittome:chat-notification-prefs";

export type ChatNotificationPrefs = {
  enabled: boolean;
  prompted: boolean;
};

const DEFAULT_PREFS: ChatNotificationPrefs = {
  enabled: false,
  prompted: false,
};

function readPrefs(): ChatNotificationPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;

    const parsed = JSON.parse(raw) as Partial<ChatNotificationPrefs>;
    return {
      enabled: parsed.enabled === true,
      prompted: parsed.prompted === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: ChatNotificationPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function getChatNotificationPrefs(): ChatNotificationPrefs {
  return readPrefs();
}

export function areChatNotificationsEnabled(): boolean {
  if (readPrefs().enabled) return true;
  // Browser already granted the OS permission (Chrome settings / earlier Yes).
  // Prefs can stay false after logout reset or a dismissed prompt while the
  // site still has Notification.permission === "granted" — that killed banners.
  if (
    typeof window !== "undefined" &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  ) {
    return true;
  }
  return false;
}

/** Keep prefs in sync when the browser already granted notification permission. */
export function syncChatNotificationPrefsFromBrowserPermission() {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const current = readPrefs();
  if (current.enabled) return;
  writePrefs({ ...current, enabled: true });
}

export function setChatNotificationsEnabled(enabled: boolean) {
  const current = readPrefs();
  writePrefs({ ...current, enabled });
}

export function completeChatNotificationPrompt(enabled: boolean) {
  writePrefs({ enabled, prompted: true });
}

export function resetChatNotificationPromptOnLogout() {
  writePrefs({ enabled: false, prompted: false });
}

export function subscribeChatNotificationPrefs(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function getChatNotificationPrefsVersion() {
  const prefs = readPrefs();
  return `${prefs.enabled ? 1 : 0}-${prefs.prompted ? 1 : 0}`;
}
