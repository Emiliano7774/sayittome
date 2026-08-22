import { isProfileAnonChatId, parseProfileAnonChatId, safeChatPart } from "@/lib/chat/anonChatId";
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

export function exactUsernameEquals(left: string, right: string) {
  const a = String(left || "").trim().toLowerCase();
  const b = String(right || "").trim().toLowerCase();
  return Boolean(a) && a === b;
}

export function exactChatIdEquals(left: string, right: string) {
  return String(left || "") === String(right || "");
}

/**
 * Queryable destination/owner UID fields.
 * initiatorUid is never owner. anonOwnerUid alone is never proof — do not query it.
 */
export const MODERATION_OWNER_UID_FIELDS = ["receptorUid", "targetUid"] as const;

export function canonicalOwnerUids(chat: Record<string, unknown>) {
  const out: string[] = [];
  for (const key of MODERATION_OWNER_UID_FIELDS) {
    const value = String(chat[key] || "").trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

export function planModerationActivityTouches(chat: Record<string, unknown>) {
  const ownerUsernames: string[] = [];
  const target = String(chat.targetUsername || "").trim();
  const receptor = String(chat.receptorUsername || "").trim();
  if (target) ownerUsernames.push(target);
  if (receptor && !exactUsernameEquals(receptor, target)) ownerUsernames.push(receptor);
  return {
    ownerUsernames,
    ownerUids: canonicalOwnerUids(chat),
  };
}

export function moderationActivityWriteUsernames(
  chat: Record<string, unknown>,
  resolvedByUid: Record<string, string> = {},
) {
  const plan = planModerationActivityTouches(chat);
  const names = new Set<string>();
  for (const username of plan.ownerUsernames) {
    const clean = String(username || "").trim();
    if (clean) names.add(clean);
  }
  for (const uid of plan.ownerUids) {
    const resolved = String(resolvedByUid[uid] || "").trim();
    if (resolved) names.add(resolved);
  }
  return [...names];
}

export function chatBelongsToProfile(
  chat: Record<string, unknown>,
  username: string,
  uid = "",
) {
  const profile = String(username || "").trim();
  if (!profile) return false;

  if (exactUsernameEquals(String(chat.targetUsername || ""), profile)) return true;
  if (exactUsernameEquals(String(chat.receptorUsername || ""), profile)) return true;

  const ownerUid = String(uid || "").trim();
  if (ownerUid && canonicalOwnerUids(chat).includes(ownerUid)) return true;

  const chatId = String(chat.id || "");
  if (isProfileAnonChatId(chatId)) {
    return parseProfileAnonChatId(chatId).targetKey === safeChatPart(profile);
  }

  return false;
}

export function filterChatsOwnedByProfile(
  chats: Record<string, unknown>[],
  username: string,
  uid = "",
) {
  return chats.filter((chat) => chatBelongsToProfile(chat, username, uid));
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
