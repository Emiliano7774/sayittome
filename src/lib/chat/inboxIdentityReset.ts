import { clearCachedChatMessages } from "@/lib/chat/chatMessageCache";
import { clearChatsInboxHydrationSession } from "@/hooks/useChatsInboxReady";
import { clearInboxSnapshotCache } from "@/lib/chat/inboxSnapshot";
import { clearPreparedProfileChat } from "@/lib/chat/profileChatWarmup";
import { clearSessionChats } from "@/lib/chat/sessionChats";

export const INBOX_IDENTITY_RESET_EVENT = "sayittome-inbox-identity-reset";

/**
 * Drop every local inbox surface that belonged to the previous principal.
 * Logout / fresh-anon must not keep painting the registered profile's chats.
 */
export function resetInboxForIdentityChange() {
  clearInboxSnapshotCache();
  clearSessionChats();
  clearChatsInboxHydrationSession();
  clearCachedChatMessages();
  clearPreparedProfileChat();

  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(INBOX_IDENTITY_RESET_EVENT));
}
