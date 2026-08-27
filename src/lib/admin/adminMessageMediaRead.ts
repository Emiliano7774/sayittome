import {
  exactMessageCollectionName,
  moderationMessagePath,
  type ModerationMessageCollection,
} from "@/lib/moderation/moderationMessageCollections";

const VIEW_ONCE_SECRETS_COLLECTION = "viewOnceSecrets";

function viewOnceSecretDocId(chatId: string, messageId: string) {
  return `${String(chatId || "").trim()}_${String(messageId || "").trim()}`;
}

export type AdminMessageMediaReadResult =
  | {
      ok: true;
      mediaUrl: string;
      type: string;
      viewOnce: boolean;
      viewOnceLimit?: number;
      viewOnceOpenedCount?: number;
      viewOnceExhausted?: boolean;
      readOnly: true;
    }
  | { ok: false; error: string; status: number };

/**
 * Admin read-only message media — never increments viewOnce openedCount or marks seen.
 */
export async function readAdminMessageMedia(input: {
  chatId: string;
  messageId: string;
  collectionName: ModerationMessageCollection;
}): Promise<AdminMessageMediaReadResult> {
  const chatId = String(input.chatId || "").trim();
  const messageId = String(input.messageId || "").trim();
  const collectionName = exactMessageCollectionName(input.collectionName);
  if (!chatId || !messageId || !collectionName) {
    return { ok: false, error: "missing_fields", status: 400 };
  }

  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const db = getRepairAdminDb();
  const messageRef = db
    .collection("chats")
    .doc(chatId)
    .collection(collectionName)
    .doc(messageId);
  const messageSnap = await messageRef.get();
  if (!messageSnap.exists) {
    return { ok: false, error: "message_not_found", status: 404 };
  }

  const message = (messageSnap.data() || {}) as Record<string, unknown>;
  const type = String(message.type || "text").trim() || "text";
  const viewOnce = message.viewOnce === true;

  let mediaUrl = String(message.mediaUrl || message.imageUrl || message.audioUrl || "").trim();

  if (viewOnce) {
    const secretSnap = await db
      .collection(VIEW_ONCE_SECRETS_COLLECTION)
      .doc(viewOnceSecretDocId(chatId, messageId))
      .get();
    const secretUrl = String((secretSnap.data() || {}).mediaUrl || "").trim();
    if (secretUrl) mediaUrl = secretUrl;
  }

  if (!mediaUrl && (type === "image" || type === "photo" || type === "video" || type === "audio" || type === "voice")) {
    return { ok: false, error: "media_unavailable", status: 404 };
  }

  if (!mediaUrl) {
    return { ok: false, error: "no_media", status: 404 };
  }

  return {
    ok: true,
    mediaUrl,
    type,
    viewOnce,
    viewOnceLimit: Number(message.viewOnceLimit) || undefined,
    viewOnceOpenedCount: Number(message.viewOnceOpenedCount) || undefined,
    viewOnceExhausted: message.viewOnceExhausted === true,
    readOnly: true,
  };
}

export { moderationMessagePath };
