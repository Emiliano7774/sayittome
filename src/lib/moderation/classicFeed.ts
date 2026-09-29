import { discoveryOwnerUids, groupChatsByCalendarDay, timestampMs } from "@/lib/moderation/chatHistory";

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
  return timestampMs(chat.updatedAt) || timestampMs(chat.createdAt) || 0;
}

export function chatReviewedMs(chat: ModerationChatRow) {
  return timestampMs(chat.moderationReviewedAt) || 0;
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

/** Merge authoritative full snapshot with a bounded live window by chatId. */
export function mergeChatsById(
  authoritative: ModerationChatRow[],
  recentLive: ModerationChatRow[],
): ModerationChatRow[] {
  const map = new Map<string, ModerationChatRow>();
  for (const chat of authoritative) {
    if (!chat?.id) continue;
    map.set(chat.id, chat);
  }
  for (const chat of recentLive) {
    if (!chat?.id) continue;
    const existing = map.get(chat.id);
    if (!existing || chatActivityMs(chat) >= chatActivityMs(existing)) {
      map.set(chat.id, chat);
    }
  }
  return [...map.values()].sort((a, b) => chatActivityMs(b) - chatActivityMs(a));
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
    // Never treat anon session ids as profile owners in the admin feed.
    if (clean.startsWith("anon_")) return;

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

    for (const uid of discoveryOwnerUids(chat as unknown as Record<string, unknown>)) {
      if (!uid) continue;
      const username = uidToUsername[uid];
      if (username) touch(username, chat, uid);
    }
  }

  return [...map.values()]
    .map(({ chatIds: _chatIds, ...entry }) => entry)
    .sort((a, b) => b.lastActivityMs - a.lastActivityMs);
}

/**
 * Profiles are optional hints (photos/unseen). Chat-derived entries always win
 * discovery — a real chat must appear even when moderation_profiles is missing.
 */
export function mergeModerationFeed(
  profiles: ModerationProfileRow[],
  chatFeed: ModerationUserFeedEntry[],
  seenByUsername: Record<string, number>,
): ModerationUserFeedEntry[] {
  const map = new Map<string, ModerationUserFeedEntry>();

  // Seed from chats first so discovery does not depend on moderation_profiles.
  for (const entry of chatFeed) {
    const key = safeProfileKey(entry.username);
    if (!key) continue;
    map.set(key, { ...entry });
  }

  for (const profile of profiles) {
    const username = String(profile.username || "").trim();
    if (!username) continue;

    const key = safeProfileKey(username);
    const activityMs = Number(profile.lastModerationActivityMs || 0);
    const seenMs = seenByUsername[key] ?? 0;
    const existing = map.get(key);

    if (!existing) {
      // Profile-only rows without chats stay as soft hints (chatCount 0).
      map.set(key, {
        username,
        uid: profile.uid,
        lastActivityMs: activityMs,
        lastMessage: profile.lastMessagePreview || "",
        lastChatId: profile.lastChatId || "",
        unseen: Boolean(profile.unseen) || activityMs > seenMs,
        chatCount: 0,
      });
      continue;
    }

    if (profile.uid && !existing.uid) existing.uid = profile.uid;
    if (activityMs > existing.lastActivityMs) {
      existing.lastActivityMs = activityMs;
      existing.lastMessage =
        profile.lastMessagePreview || existing.lastMessage;
      existing.lastChatId = profile.lastChatId || existing.lastChatId;
    }
    existing.unseen =
      existing.unseen ||
      Boolean(profile.unseen) ||
      existing.lastActivityMs > seenMs;
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

/** @deprecated Use groupChatsByCalendarDay — kept for imports. */
export function groupChatsByTemporal(
  chats: ModerationChatRow[],
  _profileUsername?: string,
): TemporalChatSection[] {
  return groupChatsByCalendarDay(chats);
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
