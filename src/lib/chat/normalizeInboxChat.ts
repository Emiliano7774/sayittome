import type { InboxChat } from "@/hooks/useChatsInbox";

function inboxTimestampMs(updatedAt: unknown) {
  if (!updatedAt) return 0;

  if (typeof updatedAt === "number" && Number.isFinite(updatedAt)) {
    return updatedAt;
  }

  if (typeof updatedAt === "object") {
    const value = updatedAt as {
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    };

    if (typeof value.toMillis === "function") {
      try {
        return value.toMillis() || 0;
      } catch {
        return 0;
      }
    }

    const seconds = Number(value.seconds ?? value._seconds ?? 0);
    const nanos = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
    if (seconds > 0) return seconds * 1000 + Math.floor(nanos / 1_000_000);
  }

  return 0;
}

function normalizedTimestamp(value: unknown) {
  const ms = inboxTimestampMs(value);
  return ms > 0 ? { toMillis: () => ms } : undefined;
}

function asTimestampRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const next: Record<string, { toMillis: () => number }> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const timestamp = normalizedTimestamp(raw);
    if (timestamp) next[key] = timestamp;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function asStringRecord<T extends string | number | boolean>(
  value: unknown,
  valueKind: "string" | "number" | "boolean",
): Record<string, T> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const next: Record<string, T> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (valueKind === "string" && typeof raw === "string") next[key] = raw as T;
    if (valueKind === "number" && typeof raw === "number") next[key] = raw as T;
    if (valueKind === "boolean" && typeof raw === "boolean") next[key] = raw as T;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export function normalizeInboxChat(raw: InboxChat): InboxChat | null {
  const id = String(raw?.id || "").trim();
  if (!id) return null;

  const updatedAtMs = inboxTimestampMs(raw.updatedAt);

  return {
    ...raw,
    id,
    canonicalChatId: raw.canonicalChatId ? String(raw.canonicalChatId) : undefined,
    targetUsername: raw.targetUsername ? String(raw.targetUsername) : undefined,
    receptorUsername: raw.receptorUsername ? String(raw.receptorUsername) : undefined,
    otherUsername: raw.otherUsername ? String(raw.otherUsername) : undefined,
    lastMessage: String(raw.lastMessage || ""),
    lastMessageSender: String(raw.lastMessageSender || ""),
    latestMessageId: raw.latestMessageId
      ? String(raw.latestMessageId)
      : undefined,
    latestSenderKind: raw.latestSenderKind
      ? String(raw.latestSenderKind)
      : undefined,
    latestSenderAnonSessionId: raw.latestSenderAnonSessionId
      ? String(raw.latestSenderAnonSessionId)
      : undefined,
    lastMessageAt: normalizedTimestamp(raw.lastMessageAt),
    targetPhoto: raw.targetPhoto ? String(raw.targetPhoto) : undefined,
    anonSessionId: raw.anonSessionId ? String(raw.anonSessionId) : undefined,
    anonOwnerUid: raw.anonOwnerUid ? String(raw.anonOwnerUid) : undefined,
    readBy: asStringRecord<boolean>(raw.readBy, "boolean"),
    readAt: asTimestampRecord(raw.readAt),
    unreadCounts: asStringRecord<number>(raw.unreadCounts, "number"),
    participantes: Array.isArray(raw.participantes)
      ? raw.participantes.map((entry) => String(entry))
      : undefined,
    updatedAt: updatedAtMs
      ? {
          toMillis: () => updatedAtMs,
        }
      : undefined,
  };
}
