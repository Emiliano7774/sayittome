import { clearSessionChats } from "@/lib/chat/sessionChats";
import { deleteAnonymousChatsForSession } from "@/lib/chat/anonChatCleanup";
import { clearLocalChatReadForViewer } from "@/lib/chat/localChatRead";
import { deleteAnonymousStoriesForSession } from "@/lib/stories/anonStories";

const ANON_KEY = "sayittome_anon_session";
const ANON_RESET_FLAG = "sayittome_anon_reset_pending";
export const ANON_SESSION_CHANGED_EVENT = "sayittome-anon-session-changed";

function notifyAnonSessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ANON_SESSION_CHANGED_EVENT));
}

function mintAnonSessionId() {
  return (
    "anon_" +
    Math.random().toString(36).slice(2) +
    "_" +
    Date.now().toString(36)
  );
}

export function getAnonSessionId() {
  if (typeof window === "undefined") {
    return "anon_server";
  }

  let current = sessionStorage.getItem(ANON_KEY);

  if (!current) {
    current = mintAnonSessionId();
    sessionStorage.setItem(ANON_KEY, current);
    notifyAnonSessionChanged();
  }

  return current;
}

export function resetAnonSession() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(ANON_KEY);
}

/** Next shuffle entry should start with a brand-new anonymous identity. */
export function markAnonSessionForReset() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(ANON_RESET_FLAG, "1");
}

export function consumeAnonSessionReset() {
  if (typeof window === "undefined") {
    return false;
  }

  if (sessionStorage.getItem(ANON_RESET_FLAG) !== "1") {
    return false;
  }

  sessionStorage.removeItem(ANON_RESET_FLAG);
  return true;
}

/**
 * Rotate live anon identity once without destroying chats, messages,
 * read-state, session chat ids, or thread continuity. Old messages keep
 * their authored anon ids; chatId stays bound to the original visitor.
 */
export function rotateAnonSessionPreserving() {
  if (typeof window === "undefined") {
    return { previous: "", next: "anon_server" };
  }

  const previous = sessionStorage.getItem(ANON_KEY) || "";
  let next = mintAnonSessionId();
  if (next === previous) {
    next = mintAnonSessionId();
  }
  sessionStorage.setItem(ANON_KEY, next);
  notifyAnonSessionChanged();
  void import("@/lib/chat/resolveProfileChat").then((mod) => {
    mod.invalidateProfileChatCache();
  });
  return { previous, next };
}

/** Discards the current anonymous identity and session chats. */
export function beginFreshAnonSession() {
  const oldSession =
    typeof window !== "undefined" ? sessionStorage.getItem(ANON_KEY) : null;

  resetAnonSession();
  clearSessionChats();

  if (oldSession) {
    clearLocalChatReadForViewer(oldSession);
    void deleteAnonymousStoriesForSession(oldSession);
    void deleteAnonymousChatsForSession(oldSession);
    void import("@/lib/chat/threadAnonContinuity").then((mod) => {
      mod.clearThreadAnonContinuity({ rootAnonSessionId: oldSession });
    });
  }

  const next = getAnonSessionId();
  notifyAnonSessionChanged();
  void import("@/lib/chat/resolveProfileChat").then((mod) => {
    mod.invalidateProfileChatCache();
  });
  return next;
}

/** Apply a pending reset (after visiting home) before using shuffle/anonymous features. */
export function ensureFreshAnonSessionIfPending() {
  if (consumeAnonSessionReset()) {
    return beginFreshAnonSession();
  }

  return getAnonSessionId();
}
