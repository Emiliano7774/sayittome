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
  const keys = [recipient, `profile_${recipient}`];
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
    createdAtMs?: number;
    readBy?: Record<string, unknown>;
    createdByAuthUid?: string;
    senderAuthUid?: string;
  }>;
  recipientUid: string;
  /** Proven sender aliases of the recipient (e.g. visitor's anon_* thread identity). */
  ownSenderAliases?: string[];
  titleForMessage: (message: {
    fromUid?: string;
    senderKind?: string;
  }) => string;
  limit?: number;
}): UnreadNotifLine[] {
  const limit = Math.max(1, Math.min(Number(input.limit) || 20, 30));
  const unread = input.messages
    .filter((row) => isMessageUnreadForRecipient(row, input.recipientUid, input.ownSenderAliases))
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));

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
