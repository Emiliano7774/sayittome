import type {
  ModerationChatRow,
  ModerationProfileRow,
  ModerationUserFeedEntry,
  TemporalChatSection,
} from "./types";

export function safeProfileKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 80);
}

export function chatActivityMs(chat: ModerationChatRow) {
  return chat.updatedAt?.toMillis?.() ?? chat.createdAt?.toMillis?.() ?? 0;
}

export function chatReviewedMs(chat: ModerationChatRow) {
  return chat.moderationReviewedAt?.toMillis?.() ?? 0;
}

export function isChatUnseen(chat: ModerationChatRow) {
  return chatActivityMs(chat) > chatReviewedMs(chat);
}

export function profileUsernamesFromChat(chat: ModerationChatRow) {
  const names = new Set<string>();
  for (const value of [chat.targetUsername, chat.receptorUsername]) {
    const clean = String(value || "").trim();
    if (clean) names.add(clean);
  }
  return [...names];
}

export function aggregateChatsToUserFeed(
  chats: ModerationChatRow[],
  seenByUsername: Record<string, number>,
  uidToUsername: Record<string, string>,
): ModerationUserFeedEntry[] {
  const map = new Map<string, ModerationUserFeedEntry & { chatIds: Set<string> }>();

  function touch(username: string, chat: ModerationChatRow, uid?: string) {
    const clean = String(username || "").trim();
    if (!clean) return;

    const key = clean.toLowerCase();
    const activityMs = chatActivityMs(chat);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        username: clean,
        uid,
        lastActivityMs: activityMs,
        lastMessage: chat.lastMessage || "",
        lastChatId: chat.id,
        unseen: activityMs > (seenByUsername[key] ?? 0),
        chatCount: 1,
        chatIds: new Set([chat.id]),
      });
      return;
    }

    existing.chatIds.add(chat.id);
    existing.chatCount = existing.chatIds.size;
    if (uid && !existing.uid) existing.uid = uid;

    if (activityMs >= existing.lastActivityMs) {
      existing.lastActivityMs = activityMs;
      existing.lastMessage = chat.lastMessage || existing.lastMessage;
      existing.lastChatId = chat.id;
    }

    existing.unseen =
      existing.lastActivityMs > (seenByUsername[key] ?? 0) ||
      isChatUnseen(chat);
  }

  for (const chat of chats) {
    for (const username of profileUsernamesFromChat(chat)) {
      touch(username, chat, chat.receptorUid || chat.targetUid);
    }

    for (const uid of [
      chat.receptorUid,
      chat.targetUid,
      chat.initiatorUid,
      chat.anonOwnerUid,
    ]) {
      if (!uid) continue;
      const username = uidToUsername[uid];
      if (username) touch(username, chat, uid);
    }
  }

  return [...map.values()]
    .map(({ chatIds: _chatIds, ...entry }) => entry)
    .sort((a, b) => b.lastActivityMs - a.lastActivityMs);
}

export function mergeModerationFeed(
  profiles: ModerationProfileRow[],
  chatFeed: ModerationUserFeedEntry[],
  seenByUsername: Record<string, number>,
): ModerationUserFeedEntry[] {
  const map = new Map<string, ModerationUserFeedEntry>();

  for (const profile of profiles) {
    const username = String(profile.username || "").trim();
    if (!username) continue;

    const key = safeProfileKey(username);
    const activityMs = Number(profile.lastModerationActivityMs || 0);
    const seenMs = seenByUsername[key] ?? 0;

    map.set(key, {
      username,
      uid: profile.uid,
      lastActivityMs: activityMs,
      lastMessage: profile.lastMessagePreview || "",
      lastChatId: profile.lastChatId || "",
      unseen: Boolean(profile.unseen) || activityMs > seenMs,
      chatCount: 0,
    });
  }

  for (const entry of chatFeed) {
    const key = safeProfileKey(entry.username);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, entry);
      continue;
    }

    existing.chatCount = Math.max(existing.chatCount, entry.chatCount);
    if (entry.uid && !existing.uid) existing.uid = entry.uid;

    if (entry.lastActivityMs > existing.lastActivityMs) {
      existing.lastActivityMs = entry.lastActivityMs;
      existing.lastMessage = entry.lastMessage || existing.lastMessage;
      existing.lastChatId = entry.lastChatId || existing.lastChatId;
    }

    existing.unseen =
      existing.unseen ||
      entry.unseen ||
      existing.lastActivityMs > (seenByUsername[key] ?? 0);
  }

  return [...map.values()].sort((a, b) => b.lastActivityMs - a.lastActivityMs);
}

export function getConversationType(chat: ModerationChatRow, profileUsername: string) {
  const profile = profileUsername.trim();
  const target = String(chat.targetUsername || "").trim();
  const receptor = String(chat.receptorUsername || "").trim();
  const sameBothSides =
    target &&
    receptor &&
    target.toLowerCase() === receptor.toLowerCase() &&
    target.toLowerCase() === profile.toLowerCase();

  if (chat.anon || chat.senderIsAnonymous || sameBothSides) {
    return `Anónimo → ${profile}`;
  }

  if (target && receptor && target.toLowerCase() !== receptor.toLowerCase()) {
    return `${target} ↔ ${receptor}`;
  }

  return target || receptor || profile || "Conversación";
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

export function groupChatsByTemporal(
  chats: ModerationChatRow[],
  profileUsername: string,
): TemporalChatSection[] {
  const sorted = [...chats].sort((a, b) => chatActivityMs(b) - chatActivityMs(a));
  if (sorted.length === 0) return [];

  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;

  const active = sorted[0] ? [sorted[0]] : [];
  const activeId = active[0]?.id;
  const rest = sorted.filter((chat) => chat.id !== activeId);

  const today: ModerationChatRow[] = [];
  const yesterday: ModerationChatRow[] = [];
  const recent: ModerationChatRow[] = [];
  const older: ModerationChatRow[] = [];

  for (const chat of rest) {
    const ms = chatActivityMs(chat);
    if (ms >= todayStart) today.push(chat);
    else if (ms >= yesterdayStart) yesterday.push(chat);
    else if (ms >= weekStart) recent.push(chat);
    else older.push(chat);
  }

  const sections: TemporalChatSection[] = [];

  if (active.length) {
    sections.push({ id: "active", label: "Conversación activa / más reciente", chats: active });
  }
  if (today.length) sections.push({ id: "today", label: "Conversaciones de hoy", chats: today });
  if (yesterday.length) {
    sections.push({ id: "yesterday", label: "Conversaciones de ayer", chats: yesterday });
  }
  if (recent.length) {
    sections.push({ id: "recent", label: "Conversaciones anteriores", chats: recent });
  }
  if (older.length) sections.push({ id: "older", label: "Chats viejos", chats: older });

  return sections.map((section) => ({
    ...section,
    chats: section.chats.map((chat) => ({
      ...chat,
      lastMessage: chat.lastMessage || "Sin mensajes",
    })),
  }));
}

export function formatActivityTime(ms: number) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
