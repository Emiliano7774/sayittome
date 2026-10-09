/**
 * Deterministic unread for anon↔anon direct shells (chats_anonimos).
 * Independent of profile-anon incomingChatActivity / threadPending.
 * Keys are Firebase Auth UIDs only — never match aliases.
 */

export type AnonDirectInboxUnreadInput = {
  viewerAuthUid: string;
  lastMessageSender?: string | null;
  latestMessageId?: string | null;
  latestReadMessageIds?: Record<string, string> | null;
  readBy?: Record<string, boolean> | null;
};

/** True when the latest activity is incoming and not yet read by viewerAuthUid. */
export function isAnonDirectInboxPending(input: AnonDirectInboxUnreadInput): boolean {
  const viewer = String(input.viewerAuthUid || "").trim();
  const sender = String(input.lastMessageSender || "").trim();
  if (!viewer || !sender) return false;
  if (sender === viewer) return false;

  const latestId = String(input.latestMessageId || "").trim();
  const readId = String(input.latestReadMessageIds?.[viewer] || "").trim();
  if (latestId && readId && readId === latestId) return false;
  if (!latestId && input.readBy?.[viewer] === true) return false;
  return true;
}

export function anonDirectInboxUnreadCount(
  input: AnonDirectInboxUnreadInput,
): 0 | 1 {
  return isAnonDirectInboxPending(input) ? 1 : 0;
}
