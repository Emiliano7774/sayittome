import { ANON_TO_MARKER, safeChatPart } from "@/lib/chat/anonChatId";
import { chatActivityMs } from "@/lib/moderation/classicFeed";
import type { ModerationChatRow, TemporalChatSection } from "@/lib/moderation/types";

export function timestampMs(value: unknown) {
  if (!value) return 0;
  if (typeof value === "object" && value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === "number") return value;
  return 0;
}

export function serializeModerationChatForApi(chat: ModerationChatRow) {
  return {
    id: chat.id,
    targetUsername: chat.targetUsername,
    receptorUsername: chat.receptorUsername,
    receptorUid: chat.receptorUid,
    targetUid: chat.targetUid,
    initiatorUid: chat.initiatorUid,
    anonOwnerUid: chat.anonOwnerUid,
    anonSessionId: chat.anonSessionId,
    lastMessage: chat.lastMessage,
    lastMessageSender: chat.lastMessageSender,
    anon: chat.anon,
    senderIsAnonymous: chat.senderIsAnonymous,
    suspicious: chat.suspicious,
    updatedAtMs: timestampMs(chat.updatedAt),
    createdAtMs: timestampMs(chat.createdAt),
    moderationReviewedAtMs: timestampMs(chat.moderationReviewedAt),
  };
}

export function normalizeModerationChatRow(
  raw: Record<string, unknown>,
): ModerationChatRow {
  const updatedAtMs = timestampMs(raw.updatedAt) || Number(raw.updatedAtMs || 0);
  const createdAtMs = timestampMs(raw.createdAt) || Number(raw.createdAtMs || 0);
  const reviewedAtMs =
    timestampMs(raw.moderationReviewedAt) || Number(raw.moderationReviewedAtMs || 0);

  return {
    id: String(raw.id || ""),
    targetUsername: raw.targetUsername as string | undefined,
    receptorUsername: raw.receptorUsername as string | undefined,
    receptorUid: raw.receptorUid as string | undefined,
    targetUid: raw.targetUid as string | undefined,
    initiatorUid: raw.initiatorUid as string | undefined,
    anonOwnerUid: raw.anonOwnerUid as string | undefined,
    anonSessionId: raw.anonSessionId as string | undefined,
    lastMessage: raw.lastMessage as string | undefined,
    lastMessageSender: raw.lastMessageSender as string | undefined,
    anon: raw.anon === true,
    senderIsAnonymous: raw.senderIsAnonymous === true,
    suspicious: raw.suspicious === true,
    updatedAt: updatedAtMs
      ? ({ toMillis: () => updatedAtMs } as ModerationChatRow["updatedAt"])
      : undefined,
    createdAt: createdAtMs
      ? ({ toMillis: () => createdAtMs } as ModerationChatRow["createdAt"])
      : undefined,
    moderationReviewedAt: reviewedAtMs
      ? ({ toMillis: () => reviewedAtMs } as ModerationChatRow["moderationReviewedAt"])
      : undefined,
  };
}

export function chatBelongsToProfile(
  chat: Record<string, unknown>,
  username: string,
  uid = "",
) {
  const profile = String(username || "").trim().toLowerCase();
  if (!profile) return false;

  const target = String(chat.targetUsername || "").trim().toLowerCase();
  const receptor = String(chat.receptorUsername || "").trim().toLowerCase();

  if (target === profile || receptor === profile) return true;

  if (uid) {
    const uidFields = [
      chat.targetUid,
      chat.receptorUid,
      chat.initiatorUid,
      chat.anonOwnerUid,
    ].map((value) => String(value || ""));
    if (uidFields.includes(uid)) return true;
  }

  const anonMarker = `${ANON_TO_MARKER}${safeChatPart(username)}`;
  return String(chat.id || "").includes(anonMarker);
}

export function dayKeyFromMs(ms: number) {
  if (!ms) return "sin-fecha";
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatCalendarDayLabel(dayKey: string, now = Date.now()) {
  if (dayKey === "sin-fecha") return "Sin fecha de actividad";

  const todayKey = dayKeyFromMs(now);
  const yesterdayKey = dayKeyFromMs(now - 86_400_000);

  if (dayKey === todayKey) return "Hoy";
  if (dayKey === yesterdayKey) return "Ayer";

  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: year !== new Date(now).getFullYear() ? "numeric" : undefined,
  });
}

export function formatChatStoppedAt(ms: number) {
  if (!ms) return "Sin actividad registrada";
  return new Date(ms).toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function groupChatsByCalendarDay(chats: ModerationChatRow[]): TemporalChatSection[] {
  const sorted = [...chats].sort((a, b) => chatActivityMs(b) - chatActivityMs(a));
  if (sorted.length === 0) return [];

  const byDay = new Map<string, ModerationChatRow[]>();

  for (const chat of sorted) {
    const key = dayKeyFromMs(chatActivityMs(chat));
    const bucket = byDay.get(key) || [];
    bucket.push(chat);
    byDay.set(key, bucket);
  }

  return [...byDay.entries()]
    .sort(([left], [right]) => {
      if (left === "sin-fecha") return 1;
      if (right === "sin-fecha") return -1;
      return right.localeCompare(left);
    })
    .map(([dayKey, dayChats]) => ({
      id: dayKey,
      label: formatCalendarDayLabel(dayKey),
      chats: dayChats.map((chat) => ({
        ...chat,
        lastMessage: chat.lastMessage || "Sin mensajes",
      })),
    }));
}

export function filterChatsByDayKey(chats: ModerationChatRow[], dayKey: string) {
  if (!dayKey) return chats;
  return chats.filter((chat) => dayKeyFromMs(chatActivityMs(chat)) === dayKey);
}

export function listAvailableChatDayKeys(chats: ModerationChatRow[]) {
  const keys = new Set<string>();
  for (const chat of chats) {
    keys.add(dayKeyFromMs(chatActivityMs(chat)));
  }

  return [...keys]
    .filter((key) => key !== "sin-fecha")
    .sort((a, b) => b.localeCompare(a));
}
