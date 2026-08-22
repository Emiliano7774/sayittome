export const MODERATION_MESSAGE_COLLECTIONS = ["mensajes", "messages"] as const;

export type ModerationMessageCollection = (typeof MODERATION_MESSAGE_COLLECTIONS)[number];

export function exactMessageCollectionName(
  value: string | null | undefined,
): ModerationMessageCollection | "" {
  if (value === "mensajes" || value === "messages") return value;
  return "";
}

export function moderationMessagePath(
  chatId: string,
  collectionName: ModerationMessageCollection,
  messageId: string,
) {
  return `chats/${chatId}/${collectionName}/${messageId}`;
}

export type ListedModerationMessage = {
  id: string;
  chatId: string;
  collectionName: ModerationMessageCollection;
  collectionPath: string;
  createdAtMs: number;
  text?: string;
  type?: string;
  reply?: string;
};

export function mergeModerationMessagePages(
  pages: Array<{
    chatId: string;
    collectionName: ModerationMessageCollection;
    rows: Array<{ id: string; createdAtMs?: number; text?: string; type?: string; reply?: string }>;
  }>,
  limitCount: number,
): ListedModerationMessage[] {
  const byPath = new Map<string, ListedModerationMessage>();
  for (const page of pages) {
    const collectionName = exactMessageCollectionName(page.collectionName);
    if (!collectionName) continue;
    const chatId = String(page.chatId || "");
    if (!chatId) continue;
    for (const row of page.rows) {
      const id = String(row.id || "");
      if (!id) continue;
      const collectionPath = moderationMessagePath(chatId, collectionName, id);
      byPath.set(collectionPath, {
        id,
        chatId,
        collectionName,
        collectionPath,
        createdAtMs: Number(row.createdAtMs || 0),
        text: row.text,
        type: row.type,
        reply: row.reply,
      });
    }
  }

  return [...byPath.values()]
    .sort((a, b) => {
      if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
      if (a.collectionName !== b.collectionName) {
        return a.collectionName.localeCompare(b.collectionName);
      }
      return a.id.localeCompare(b.id);
    })
    .slice(0, Math.max(0, limitCount));
}
