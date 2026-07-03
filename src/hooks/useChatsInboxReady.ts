type InboxGateInput = {
  loading: boolean;
  sortedChats: readonly unknown[];
};

let inboxHasHydratedOnce = false;

/** Keep the chats list visible when returning from a thread if data is already in memory. */
export function shouldShowChatsInboxSkeleton(
  inbox: InboxGateInput,
  mounted: boolean,
  authGraceReady: boolean,
) {
  if (inbox.sortedChats.length > 0) {
    inboxHasHydratedOnce = true;
    return false;
  }

  if (inboxHasHydratedOnce) {
    return false;
  }

  return (!mounted || inbox.loading) && !authGraceReady;
}
