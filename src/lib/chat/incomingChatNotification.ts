import type { InboxChat } from "@/hooks/useChatsInbox";
import { isOwnChatSender, resolveChatViewerRole } from "@/lib/chat/incomingChatActivity";
import { resolveChatViewerId } from "@/lib/chat/inboxPeerTitle";

type MessageAuthor = {
  fromUid?: string; senderUid?: string; ownerId?: string; senderKind?: string;
  senderAuthUid?: string; createdByAuthUid?: string;
};
export type NotificationDirection = "incoming" | "own" | "unknown";

/** Notification-only policy. Does not change stored authorship or read receipts. */
export function chatNotificationDirection(
  message: MessageAuthor, viewerId: string, firebaseUid = "", chat?: InboxChat,
): NotificationDirection {
  const from = String(message.fromUid || message.senderUid || message.ownerId || "").trim();
  if (!from || !viewerId) return "unknown";
  if (firebaseUid && [message.senderAuthUid, message.createdByAuthUid].some((id) => id === firebaseUid)) {
    return "own";
  }
  if (chat && (chat.canonicalChatId || chat.id).includes("__anon_to__")) {
    const role = resolveChatViewerRole({ viewerId, firebaseUid, chat });
    const kind = from.startsWith("anon_") ? "anon"
      : from.startsWith("profile_") ? "profile" : message.senderKind;
    if (role.viewerKind === "unknown" || (kind !== "anon" && kind !== "profile")) return "unknown";
    // Keep the deployed role policy: an old visitor alias remains that
    // visitor's own message after rotation, not a new incoming author.
    const ownKind = role.viewerKind === "anon" ? "anon" : "profile";
    return kind === ownKind ? "own" : "incoming";
  }
  // Ordinary profile/profile chats have no anonymous-owner role. Comparing
  // actual authors is sufficient; senderKind=profile is not a reason to drop.
  return isOwnChatSender(from, viewerId, firebaseUid, chat) ||
    (firebaseUid && (from === firebaseUid || from === `profile_${firebaseUid}`))
    ? "own" : "incoming";
}

export function isIncomingChatNotification(
  message: MessageAuthor, viewerId: string, firebaseUid = "", chat?: InboxChat,
) {
  return chatNotificationDirection(message, viewerId, firebaseUid, chat) === "incoming";
}

/** Keep an unknown new id retryable when sender/role metadata hydrates. */
export function classifiedInboxNotificationIds(
  chats: InboxChat[], firebaseUid: string, previous: Map<string, string> | null,
) {
  const next = new Map<string, string>();
  for (const chat of chats) {
    const id = chat.canonicalChatId || chat.id;
    if (!id) continue;
    const direction = chatNotificationDirection(
      { fromUid: chat.lastMessageSender, senderKind: chat.latestSenderKind },
      resolveChatViewerId(chat, firebaseUid), firebaseUid, chat,
    );
    if (direction !== "unknown") next.set(id, String(chat.latestMessageId || ""));
    else if (previous?.has(id)) next.set(id, previous.get(id)!);
  }
  return next;
}
