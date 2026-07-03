type InboxGateInput = {
  loading: boolean;
  sortedChats: readonly unknown[];
};

let inboxHasHydratedOnce = false;
let lastKnownInboxCount = 0;

export function markChatsInboxHydrated(chatCount = lastKnownInboxCount) {
  if (chatCount > 0) {
    lastKnownInboxCount = Math.max(lastKnownInboxCount, chatCount);
  }
  inboxHasHydratedOnce = true;
}

export function rememberInboxChatCount(count: number) {
  if (count > 0) {
    lastKnownInboxCount = Math.max(lastKnownInboxCount, count);
    inboxHasHydratedOnce = true;
  }
}

/** Keep the chats list visible when returning from a thread if data is already in memory. */
export function shouldShowChatsInboxSkeleton(
  inbox: InboxGateInput,
  authGraceReady: boolean,
) {
  const chatCount = inbox.sortedChats.length;

  if (chatCount > 0) {
    rememberInboxChatCount(chatCount);
    return false;
  }

  if (inboxHasHydratedOnce || lastKnownInboxCount > 0) {
    return false;
  }

  return inbox.loading && !authGraceReady;
}
