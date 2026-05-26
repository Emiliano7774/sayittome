export const ANON_TO_MARKER = "__anon_to__";

export function safeChatPart(value: string) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gi, "_")
      .slice(0, 80) || "usuario"
  );
}

/** Stable profile anon chat id (username slug, never target uid). */
export function buildProfileAnonChatId(senderId: string, username: string) {
  return `${senderId}${ANON_TO_MARKER}${safeChatPart(username)}`;
}

export function isProfileAnonChatId(chatId: string) {
  return String(chatId || "").includes(ANON_TO_MARKER);
}

export function parseProfileAnonChatId(chatId: string) {
  const [senderId = "", targetKey = ""] = String(chatId || "").split(ANON_TO_MARKER);
  return { senderId, targetKey };
}

/** Legacy ids that may exist before migration. */
export function buildLegacyProfileChatIds(
  senderId: string,
  username: string,
  targetUid?: string,
) {
  const canonical = buildProfileAnonChatId(senderId, username);
  const legacy = new Set<string>([canonical]);

  if (targetUid) {
    legacy.add(`${senderId}${ANON_TO_MARKER}${safeChatPart(targetUid)}`);
    legacy.add(`${senderId}${ANON_TO_MARKER}${targetUid}`);
  }

  return Array.from(legacy);
}

export function inboxDedupeKey(chat: {
  id: string;
  targetUsername?: string;
  receptorUsername?: string;
}) {
  const title = chat.targetUsername || chat.receptorUsername;
  if (title) return `profile:${safeChatPart(title)}`;
  if (isProfileAnonChatId(chat.id)) {
    return `profile:${parseProfileAnonChatId(chat.id).targetKey}`;
  }
  return `id:${chat.id}`;
}
