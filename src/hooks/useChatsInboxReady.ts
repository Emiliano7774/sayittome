import { readInboxSnapshotWithMeta } from "@/lib/chat/inboxSnapshot";

const INBOX_HYDRATED_SESSION_KEY = "sayittome:inbox:hydrated:v1";

type InboxGateInput = {
  loading: boolean;
  sortedChats: readonly unknown[];
};

let inboxHasHydratedOnce = false;
let lastKnownInboxCount = 0;

function readPersistedInboxHydrated() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(INBOX_HYDRATED_SESSION_KEY) === "1";
}

function persistInboxHydrated() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(INBOX_HYDRATED_SESSION_KEY, "1");
}

if (readPersistedInboxHydrated()) {
  inboxHasHydratedOnce = true;
}

export function markChatsInboxHydrated(chatCount = lastKnownInboxCount) {
  if (chatCount > 0) {
    lastKnownInboxCount = Math.max(lastKnownInboxCount, chatCount);
  }
  inboxHasHydratedOnce = true;
  persistInboxHydrated();
}

export function rememberInboxChatCount(count: number) {
  if (count > 0) {
    lastKnownInboxCount = Math.max(lastKnownInboxCount, count);
    inboxHasHydratedOnce = true;
    persistInboxHydrated();
  }
}

export function clearChatsInboxHydrationSession() {
  inboxHasHydratedOnce = false;
  lastKnownInboxCount = 0;
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(INBOX_HYDRATED_SESSION_KEY);
  }
}

/** Explain why the full-page skeleton is shown (bench diagnostics). */
export function explainChatsInboxSkeleton(inbox: InboxGateInput) {
  const chatCount = inbox.sortedChats.length;

  if (chatCount > 0) {
    return { show: false, reason: "sorted-chats-nonempty" as const };
  }

  const snapshotCount = readInboxSnapshotWithMeta().chats.length;
  if (snapshotCount > 0) {
    return { show: false, reason: "snapshot-available" as const };
  }

  if (inboxHasHydratedOnce || readPersistedInboxHydrated() || lastKnownInboxCount > 0) {
    return { show: false, reason: "session-hydrated-flag" as const };
  }

  // During internal tab handoffs / post-reveal settle, never mount the
  // full-page skeleton on a transient auth.loading flicker — keep the prior
  // empty/content surface. Covers fresh-anon sequence remounts after rebind.
  if (
    typeof document !== "undefined" &&
    (document.documentElement.classList.contains("sayittome-main-tab-handoff-pending") ||
      document.documentElement.classList.contains("sayittome-shuffle-exit-handoff-pending") ||
      document.documentElement.dataset.chatsPostAuthSettle === "1" ||
      document.documentElement.dataset.tabPostAuthSettle === "1" ||
      document.documentElement.dataset.mainTabShuffleSlide === "preparing" ||
      document.documentElement.dataset.mainTabShuffleSlide === "armed" ||
      document.documentElement.dataset.mainTabShuffleSlide === "running")
  ) {
    return { show: false, reason: "handoff-suppress-skeleton" as const };
  }

  if (inbox.loading) {
    return { show: true, reason: "auth-still-loading" as const };
  }

  return { show: false, reason: "empty-not-loading" as const };
}

/** Full-page inbox loader only on the very first cold open with no cached rows. */
export function shouldShowChatsInboxSkeleton(inbox: InboxGateInput) {
  const gate = explainChatsInboxSkeleton(inbox);
  if (!gate.show && inbox.sortedChats.length > 0) {
    rememberInboxChatCount(inbox.sortedChats.length);
  } else if (!gate.show) {
    const snapshotCount = readInboxSnapshotWithMeta().chats.length;
    if (snapshotCount > 0) {
      rememberInboxChatCount(snapshotCount);
    } else if (
      gate.reason === "empty-not-loading" ||
      gate.reason === "handoff-suppress-skeleton" ||
      gate.reason === "session-hydrated-flag"
    ) {
      // Settled empty inbox must count as hydrated so a later auth.loading
      // flicker cannot remount the full-page "Cargando..." skeleton after reveal.
      markChatsInboxHydrated(0);
    }
  }
  return gate.show;
}
