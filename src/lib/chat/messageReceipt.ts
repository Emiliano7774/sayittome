import { profileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";

export type MessageReceiptStatus = "sending" | "delivered" | "seen" | "error";

/** All readBy keys that represent the outgoing sender (not the recipient). */
export function collectSenderReadByKeys(senderId: string, firebaseUid = "") {
  const keys = new Set<string>();
  const from = String(senderId || "").trim();

  if (from) keys.add(from);

  if (firebaseUid) {
    keys.add(firebaseUid);
    keys.add(profileReplyAuthorId(firebaseUid));
  }

  if (from.startsWith("profile_")) {
    const profileUid = from.slice("profile_".length);
    if (profileUid && profileUid !== "unknown") keys.add(profileUid);
  }

  return keys;
}

export function isMessageSeenByOther(
  readBy: Record<string, boolean> | undefined,
  senderId: string,
  firebaseUid = "",
) {
  const senderKeys = collectSenderReadByKeys(senderId, firebaseUid);

  return Object.entries(readBy || {}).some(
    ([key, value]) => !senderKeys.has(key) && value === true,
  );
}

export function resolveMessageReceiptStatus({
  mine,
  readBy,
  senderId,
  firebaseUid = "",
  isSending = false,
  hasError = false,
}: {
  mine: boolean;
  readBy?: Record<string, boolean>;
  senderId: string;
  firebaseUid?: string;
  isSending?: boolean;
  hasError?: boolean;
}): MessageReceiptStatus | null {
  if (!mine) return null;
  if (hasError) return "error";
  if (isSending) return "sending";
  if (isMessageSeenByOther(readBy, senderId, firebaseUid)) return "seen";
  return "delivered";
}
