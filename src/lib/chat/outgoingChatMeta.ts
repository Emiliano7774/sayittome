import { increment, serverTimestamp, type FieldValue } from "firebase/firestore";

import type { InboxChat } from "@/hooks/useChatsInbox";
import { expandReadByIdentityKeys } from "@/lib/chat/messageReceipt";

type ChatMetaSource = Partial<Pick<InboxChat, "participantes" | "targetUid" | "receptorUid">> & {
  participants?: string[];
};

export function resolveChatRecipientIds(
  senderUid: string,
  chat: ChatMetaSource | null | undefined,
): string[] {
  if (!chat || !senderUid) return [];

  const ids = new Set<string>();
  const members = chat.participantes || chat.participants || [];

  for (const uid of members) {
    if (uid && uid !== senderUid) ids.add(uid);
  }

  if (chat.targetUid && chat.targetUid !== senderUid) ids.add(chat.targetUid);
  if (chat.receptorUid && chat.receptorUid !== senderUid) ids.add(chat.receptorUid);

  return [...ids];
}

export function buildOutgoingChatMetaPatch(
  senderUid: string,
  recipients: string[],
  meta: {
    lastMessage: string;
    lastMessageSender: string;
    latestMessageId?: string;
    latestSenderKind?: string;
    latestSenderAnonSessionId?: string;
  },
): Record<string, string | boolean | FieldValue> {
  const activityAt = serverTimestamp();
  const patch: Record<string, string | boolean | FieldValue> = {
    lastMessage: meta.lastMessage,
    lastMessageSender: meta.lastMessageSender,
    updatedAt: activityAt,
    lastMessageAt: activityAt,
    ...(meta.latestMessageId
      ? { latestMessageId: meta.latestMessageId }
      : {}),
    ...(meta.latestSenderKind
      ? { latestSenderKind: meta.latestSenderKind }
      : {}),
    latestSenderAnonSessionId: meta.latestSenderAnonSessionId || "",
    [`readBy.${senderUid}`]: true,
    [`typing.${senderUid}`]: false,
  };

  for (const recipientUid of recipients) {
    for (const readByKey of expandReadByIdentityKeys(recipientUid)) {
      patch[`readBy.${readByKey}`] = false;
      // Mirror unread onto every identity alias so wasChatReadOnServer cannot
      // stay "explicitlyRead" on profile_* / firebase uid after markChatAsRead
      // when only one key was incremented (repeat-inbound highlight miss).
      patch[`unreadCounts.${readByKey}`] = increment(1);
    }
  }

  return patch;
}

/**
 * `updateDoc` interprets dotted keys as field paths, but `setDoc(..., { merge:
 * true })` treats the same object keys literally. Convert only for set/merge
 * callers so read/unread state remains a real nested map.
 */
export function expandOutgoingChatMetaPatchForSet(
  patch: Record<string, string | boolean | FieldValue>,
): Record<string, unknown> {
  const expanded: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    const separator = key.indexOf(".");
    if (separator < 0) {
      expanded[key] = value;
      continue;
    }

    const mapName = key.slice(0, separator);
    const childKey = key.slice(separator + 1);
    const current =
      expanded[mapName] && typeof expanded[mapName] === "object"
        ? (expanded[mapName] as Record<string, unknown>)
        : {};
    current[childKey] = value;
    expanded[mapName] = current;
  }

  return expanded;
}
