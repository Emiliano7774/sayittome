/** Fresh server-created shells may still be waiting for the first commit. */
export const FRESH_EMPTY_SHELL_MS = 45_000;

/** Bounded retries. Not a poll — only while a shell can still receive its first message. */
export const MISSING_PREVIEW_RETRY_MS = [350, 900, 1800] as const;

export type InboxActivityChat = {
  lastMessage?: string;
  updatedAt?: { toMillis?: () => number };
  latestMessageId?: string;
};

export function inboxActivityText(lastMessage: unknown) {
  return String(lastMessage || "").trim();
}

export function hasInboxActivity(chat: { lastMessage?: string } | null | undefined) {
  return Boolean(inboxActivityText(chat?.lastMessage));
}

/**
 * Visible activity always beats an empty shell.
 * Two visible versions: the newer summary wins.
 * Two empty versions: the newer shell wins, so an explicit newer tombstone can replace stale metadata.
 * Callers remove chats only through an explicit delete, never by feeding an empty shell.
 */
export function preferInboxChat<T extends InboxActivityChat>(
  existing: T | undefined,
  incoming: T,
): T {
  if (!existing) return incoming;
  const existingVisible = hasInboxActivity(existing);
  const incomingVisible = hasInboxActivity(incoming);
  if (existingVisible && !incomingVisible) return existing;
  if (!existingVisible && incomingVisible) return incoming;

  const existingMs = existing.updatedAt?.toMillis?.() ?? 0;
  const incomingMs = incoming.updatedAt?.toMillis?.() ?? 0;
  if (incomingMs > existingMs) return incoming;
  if (existingMs > incomingMs) return existing;
  if (incomingVisible && incoming.latestMessageId && incoming.latestMessageId !== existing.latestMessageId) {
    return incoming;
  }
  return existingVisible ? existing : incoming;
}

export function shellCreatedAtMs(data: Record<string, unknown> | null | undefined) {
  const direct = Number(data?.createdAtMs || data?.visitorLeaseBoundAtMs || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const updated = data?.updatedAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (typeof updated?.toMillis === "function") {
    try {
      const ms = Number(updated.toMillis()) || 0;
      if (ms > 0) return ms;
    } catch {
      return 0;
    }
  }
  const seconds = Number(updated?.seconds || 0);
  return seconds > 0 ? seconds * 1000 : 0;
}

/** Old confirmed-empty shells are not inbox rows. Unknown age stays so recovery can hydrate once. */
export function shouldIncludeRecoveredChat(input: {
  lastMessage?: string;
  createdAtMs?: number;
  nowMs: number;
}) {
  if (inboxActivityText(input.lastMessage)) return true;
  const created = Number(input.createdAtMs || 0);
  if (!Number.isFinite(created) || created <= 0) return true;
  return input.nowMs - created <= FRESH_EMPTY_SHELL_MS;
}

export function shouldRetryMissingPreview(input: {
  attempts: number;
  createdAtMs?: number;
  nowMs: number;
  chatId: string;
  pendingChatIds?: readonly string[];
  interrupted?: boolean;
}) {
  const attempts = Number(input.attempts || 0);
  const waiting =
    Boolean(input.interrupted) ||
    (input.pendingChatIds || []).includes(String(input.chatId || ""));
  const cap = MISSING_PREVIEW_RETRY_MS.length + (waiting ? 2 : 0);
  if (attempts >= cap) return false;
  if (waiting) return true;
  const created = Number(input.createdAtMs || 0);
  if (!Number.isFinite(created) || created <= 0) return attempts < 1;
  return input.nowMs - created <= FRESH_EMPTY_SHELL_MS && attempts < MISSING_PREVIEW_RETRY_MS.length;
}

export function missingPreviewRetryDelayMs(attempts: number) {
  const index = Math.max(0, Math.min(MISSING_PREVIEW_RETRY_MS.length - 1, attempts));
  return MISSING_PREVIEW_RETRY_MS[index];
}

export function previewFromMessageData(
  data: Record<string, unknown>,
  messageId: string,
) {
  const text = String(data.texto || data.text || "").trim();
  let lastMessage = text.slice(0, 240);
  if (!lastMessage) {
    const type = String(data.type || "").toLowerCase();
    if (type === "image" || data.viewOnce === true && type !== "video" && type !== "audio") {
      lastMessage = "Foto";
    } else if (type === "video") lastMessage = "Video";
    else if (type === "audio") lastMessage = "Audio";
    else if (type === "profile") lastMessage = "Perfil";
    else if (data.storyReply) lastMessage = "Respuesta a historia";
    else lastMessage = "Mensaje";
  }
  return {
    lastMessage,
    lastMessageSender: String(data.fromUid || data.ownerId || data.senderId || ""),
    latestMessageId: messageId,
    latestSenderKind: String(data.senderKind || data.senderRole || ""),
    createdAt: data.createdAt,
  };
}
