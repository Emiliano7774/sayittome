/** Compact unread lines for FCM data payloads (4KB budget). */

export type UnreadNotifLine = {
  t: string;
  s: string;
  ms: number;
};

export function bodyFromMessageFields(texto?: string, text?: string, type?: string) {
  const raw = String(texto || text || "").trim();
  if (raw) return raw.slice(0, 120);
  const kind = String(type || "").trim().toLowerCase();
  if (kind === "audio" || kind === "voice") return "Audio";
  if (kind === "image" || kind === "photo") return "Foto";
  if (kind === "video") return "Video";
  return "Nuevo mensaje";
}

/**
 * Direction is authoritative in a profile↔anonymous thread. Visitors can
 * rotate anon_* identities without rewriting all historical message authors.
 * For notification history, deliver only the opposing side's messages.
 */
export function isOppositeSideProfileAnonMessage(
  message: {
    fromUid?: string;
    ownerId?: string;
    senderUid?: string;
    senderKind?: string;
    senderRole?: string;
  },
  recipientUid: string,
  profileOwnerUid: string,
): boolean {
  const recipient = String(recipientUid || "").trim();
  const owner = String(profileOwnerUid || "").trim();
  if (!recipient || !owner) return false;
  const from = String(message.fromUid || message.ownerId || message.senderUid || "").trim();
  const declaredKind = String(message.senderRole || message.senderKind || "").trim();
  // Immutable author id is preferred when inconsistent legacy role metadata exists.
  const profileAuthor =
    from.startsWith("profile_") ||
    (from && from === owner) ||
    (!from.startsWith("anon_") && declaredKind === "profile");
  const anonAuthor =
    from.startsWith("anon_") ||
    (!from.startsWith("profile_") && from !== owner && declaredKind === "anon");
  if (recipient === owner) return Boolean(anonAuthor && !profileAuthor);
  return Boolean(profileAuthor && !anonAuthor);
}

export function isMessageAuthoredByRecipient(
  message: {
    fromUid?: string;
    ownerId?: string;
    senderUid?: string;
    createdByAuthUid?: string;
    senderAuthUid?: string;
  },
  recipientUid: string,
  ownSenderAliases: readonly string[] = [],
): boolean {
  const recipient = String(recipientUid || "").trim();
  if (!recipient) return false;
  const from = String(
    message.fromUid || message.ownerId || message.senderUid || "",
  ).trim();
  const senderIds = new Set(
    [recipient, `profile_${recipient}`, ...ownSenderAliases]
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  return Boolean(
    (from && senderIds.has(from)) ||
    String(message.createdByAuthUid || "").trim() === recipient ||
    String(message.senderAuthUid || "").trim() === recipient
  );
}

export function isMessageUnreadForRecipient(
  message: {
    fromUid?: string;
    ownerId?: string;
    senderUid?: string;
    readBy?: Record<string, unknown>;
    createdByAuthUid?: string;
    senderAuthUid?: string;
  },
  recipientUid: string,
  ownSenderAliases: readonly string[] = [],
): boolean {
  const recipient = String(recipientUid || "").trim();
  if (!recipient || isMessageAuthoredByRecipient(message, recipient, ownSenderAliases)) {
    return false;
  }

  const readBy = message.readBy || {};
  const keys = [recipient, `profile_${recipient}`, ...ownSenderAliases];
  for (const key of keys) {
    if (readBy[key] === true) return false;
  }
  return true;
}

export function selectUnreadNotificationLines(input: {
  messages: Array<{
    id: string;
    texto?: string;
    text?: string;
    type?: string;
    fromUid?: string;
    ownerId?: string;
    senderUid?: string;
    senderKind?: string;
    senderRole?: string;
    createdAtMs?: number;
    readBy?: Record<string, unknown>;
    createdByAuthUid?: string;
    senderAuthUid?: string;
  }>;
  recipientUid: string;
  /** Proven sender aliases of the recipient (e.g. visitor's anon_* thread identity). */
  ownSenderAliases?: string[];
  /** Only present for profile↔anonymous threads. */
  profileAnonOwnerUid?: string;
  /** Thread receipt: message documents are not updated when their chat is read. */
  afterReadAtMs?: number;
  afterReadMessageIds?: string[];
  titleForMessage: (message: {
    fromUid?: string;
    senderKind?: string;
  }) => string;
  limit?: number;
}): UnreadNotifLine[] {
  const limit = Math.max(1, Math.min(Number(input.limit) || 20, 30));
  const ordered = input.messages
    .slice()
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
  const lastReadIds = new Set((input.afterReadMessageIds || []).filter(Boolean));
  let lastReadIndex = -1;
  ordered.forEach((row, index) => {
    if (lastReadIds.has(row.id)) lastReadIndex = index;
  });
  const readAt = Math.max(0, Number(input.afterReadAtMs) || 0);
  const unread = ordered.filter((row, index) =>
    index > lastReadIndex &&
    (!readAt || !row.createdAtMs || row.createdAtMs > readAt) &&
    isMessageUnreadForRecipient(row, input.recipientUid, input.ownSenderAliases) &&
    (!input.profileAnonOwnerUid || isOppositeSideProfileAnonMessage(
      row, input.recipientUid, input.profileAnonOwnerUid,
    )),
  );

  const sliced = unread.slice(Math.max(0, unread.length - limit));
  return sliced.map((row) => ({
    t: bodyFromMessageFields(row.texto, row.text, row.type),
    s: input.titleForMessage(row).slice(0, 40) || "SayItToMe",
    ms: Number(row.createdAtMs) || Date.now(),
  }));
}

export function encodeUnreadLinesForFcm(lines: UnreadNotifLine[]): string {
  // Keep under typical FCM data budget with other keys.
  let encoded = JSON.stringify(lines);
  while (encoded.length > 3200 && lines.length > 1) {
    lines.shift();
    encoded = JSON.stringify(lines);
  }
  return encoded;
}

export function formatCollapsedUnreadBody(lines: UnreadNotifLine[]): string {
  if (lines.length === 0) return "Nuevo mensaje";
  if (lines.length === 1) return lines[0].t;
  return lines.map((line) => line.t).join("\n");
}
