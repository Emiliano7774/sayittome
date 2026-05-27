export type MessageReceiptStatus = "sending" | "delivered" | "seen" | "error";

export function isMessageSeenByOther(
  readBy: Record<string, boolean> | undefined,
  senderId: string,
) {
  return Object.entries(readBy || {}).some(
    ([key, value]) => key !== senderId && value === true,
  );
}

export function resolveMessageReceiptStatus({
  mine,
  readBy,
  senderId,
  isSending = false,
  hasError = false,
}: {
  mine: boolean;
  readBy?: Record<string, boolean>;
  senderId: string;
  isSending?: boolean;
  hasError?: boolean;
}): MessageReceiptStatus | null {
  if (!mine) return null;
  if (hasError) return "error";
  if (isSending) return "sending";
  if (isMessageSeenByOther(readBy, senderId)) return "seen";
  return "delivered";
}
