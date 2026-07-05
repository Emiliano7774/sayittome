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

/** Full-page inbox loader only on the very first cold open with no cached rows. */
export function shouldShowChatsInboxSkeleton(inbox: InboxGateInput) {
  const chatCount = inbox.sortedChats.length;

  if (chatCount > 0) {
    rememberInboxChatCount(chatCount);
    return false;
  }

  if (inboxHasHydratedOnce || readPersistedInboxHydrated() || lastKnownInboxCount > 0) {
    return false;
  }

  return inbox.loading;
}
