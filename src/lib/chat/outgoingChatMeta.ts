import { increment, serverTimestamp, type FieldValue } from "firebase/firestore";

import type { InboxChat } from "@/hooks/useChatsInbox";
import {
  collectSenderReadByKeys,
  expandReadByIdentityKeys,
} from "@/lib/chat/messageReceipt";

type ChatMetaSource = Partial<Pick<InboxChat, "participantes" | "targetUid" | "receptorUid">> & {
  participants?: string[];
};

function outgoingSenderIdentityKeys(senderUid: string, receiptSenderId = "") {
  const receipt = String(receiptSenderId || "").trim();
  const receiptFirebaseUid =
    receipt && !receipt.startsWith("anon_") && !receipt.startsWith("profile_")
      ? receipt
      : "";
  const keys = new Set<string>([
    ...collectSenderReadByKeys(senderUid, receiptFirebaseUid),
  ]);
  for (const key of expandReadByIdentityKeys(senderUid)) keys.add(key);
  for (const key of expandReadByIdentityKeys(receipt)) keys.add(key);
  return keys;
}

export function resolveChatRecipientIds(
  senderUid: string,
  chat: ChatMetaSource | null | undefined,
): string[] {
  if (!chat || !senderUid) return [];

  const ids = new Set<string>();
  const senderKeys = outgoingSenderIdentityKeys(senderUid);
  const members = chat.participantes || chat.participants || [];

  for (const uid of members) {
    if (uid && !senderKeys.has(uid)) ids.add(uid);
  }

  if (chat.targetUid && !senderKeys.has(chat.targetUid)) ids.add(chat.targetUid);
  if (chat.receptorUid && !senderKeys.has(chat.receptorUid)) {
    ids.add(chat.receptorUid);
  }

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
  options?: {
    /**
     * Identity that owns the receipt keys when it differs from the message
     * author. A profile reply is authored as `profile_<uid>` but its own
     * read/typing state belongs to the raw uid, which is the identity the chat
     * doc is bound to and the only one Firestore rules accept for the receptor.
     */
    receiptSenderId?: string;
  },
): Record<string, string | boolean | number | FieldValue> {
  const activityAt = serverTimestamp();
  const receiptSender = String(options?.receiptSenderId || "").trim() || senderUid;
  const senderKeys = outgoingSenderIdentityKeys(senderUid, receiptSender);
  const patch: Record<string, string | boolean | number | FieldValue> = {
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
    // Typing stays on the canonical identity only: rules allow exactly one key.
    [`typing.${receiptSender}`]: false,
  };

  // Own send must never leave the sender's receipt keys unread/dirty — alias
  // expansion (profile_* ↔ raw uid) used to increment the sender and re-bold
  // the row after markChatAsRead when lastMessageSender lagged.
  for (const key of senderKeys) {
    patch[`readBy.${key}`] = true;
    patch[`unreadCounts.${key}`] = 0;
  }

  for (const recipientUid of recipients) {
    for (const readByKey of expandReadByIdentityKeys(recipientUid)) {
      if (senderKeys.has(readByKey)) continue;
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
  patch: Record<string, string | boolean | number | FieldValue>,
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
