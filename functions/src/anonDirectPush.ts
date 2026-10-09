import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { type MulticastMessage } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { db, ensureAdminApp, messaging } from "./adminApp";

type ChatMeta = {
  estado?: string;
  solicitanteAuthUid?: string;
  destinatarioAuthUid?: string;
  solicitanteUid?: string;
  destinatarioUid?: string;
  solicitanteAnonId?: string;
  anonId?: string;
};
type AnonMessage = {
  senderId?: string;
  senderTipo?: string;
  texto?: string;
  text?: string;
  type?: string;
  viewOnce?: boolean;
};
type Delivery = { recipientUid: string; senderUid: string };

export function resolveAnonDirectPushDelivery(chat: ChatMeta, msg: AnonMessage): Delivery | null {
  if (chat.estado !== "activo") return null;
  const from = String(msg.senderId || "").trim();
  const fromTipo = String(msg.senderTipo || "").trim();
  const a = String(chat.solicitanteAuthUid || "").trim();
  const b = String(chat.destinatarioAuthUid || "").trim();
  if (!from || !a || !b || a === b) return null;
  const fromA = fromTipo === "anonimo"
    ? from === chat.solicitanteAnonId
    : fromTipo === "perfil" && (from === a || from === chat.solicitanteUid);
  const fromB = fromTipo === "anonimo"
    ? from === chat.anonId
    : fromTipo === "perfil" && (from === b || from === chat.destinatarioUid);
  if (fromA === fromB) return null;
  return fromA ? { senderUid: a, recipientUid: b } : { senderUid: b, recipientUid: a };
}

/** Anonymous users are ephemeral; never push after their presence is removed. */
export function anonDirectPushRecipientAlias(chat: ChatMeta, uid: string): string {
  if (chat.solicitanteAuthUid === uid) return String(chat.solicitanteAnonId || "");
  if (chat.destinatarioAuthUid === uid) return String(chat.anonId || "");
  return "";
}

export function anonDirectPushPresenceFresh(
  row: Record<string, unknown> | undefined,
  uid: string,
  chatId: string,
  now = Date.now(),
): boolean {
  if (!row || String(row.authUid || "") !== uid ||
      String(row.source || "") !== "anon_match_presence") return false;
  if (String(row.chatActualId || "") && row.chatActualId !== chatId) return false;
  const seen = Date.parse(String(row.lastSeenAt || row.updatedAt || ""));
  const expires = Date.parse(String(row.expiresAt || ""));
  return Number.isFinite(seen) && now - seen >= 0 && now - seen <= 3 * 60_000 &&
    (!Number.isFinite(expires) || expires > now);
}

export function anonDirectPushPreview(message: AnonMessage): string {
  if (message.viewOnce) return "💣 Bomba";
  if (message.type === "image") return "📷 Foto";
  if (message.type === "video") return "🎬 Video";
  if (message.type === "audio") return "🎤 Audio";
  return String(message.texto || message.text || "Nuevo mensaje").trim().slice(0, 160);
}

/** Bounded push: one parent read, <=20 token docs, one multicast. No polling. */
export const onAnonDirectMessageCreated = onDocumentCreated(
  "chats_anonimos/{chatId}/mensajes/{messageId}",
  async (event) => {
    const chatId = String(event.params.chatId || "").trim();
    const messageId = String(event.params.messageId || "").trim();
    const message = (event.data?.data() || {}) as AnonMessage;
    if (!chatId || !messageId) return;

    const chatSnap = await db().collection("chats_anonimos").doc(chatId).get();
    if (!chatSnap.exists) return;
    const delivery = resolveAnonDirectPushDelivery(chatSnap.data() as ChatMeta, message);
    if (!delivery) return;

    const recordId = createHash("sha256")
      .update(`anon-direct:${chatId}:${messageId}`).digest("hex");
    const record = db().collection("pushDeliveries").doc(recordId);
    try {
      await record.create({
        chatId, messageId, kind: "anon_direct", recipientUid: delivery.recipientUid,
        createdAt: FieldValue.serverTimestamp(), status: "pending",
      });
    } catch (error) {
      const code = (error as { code?: string | number })?.code;
      if (code === 6 || code === "already-exists") return;
      throw error;
    }

    const recipientAnonId = anonDirectPushRecipientAlias(
      chatSnap.data() as ChatMeta,
      delivery.recipientUid,
    );
    if (recipientAnonId) {
      const active = await db().collection("anonimos_activos").doc(recipientAnonId).get();
      if (!anonDirectPushPresenceFresh(
        active.exists ? active.data() : undefined,
        delivery.recipientUid,
        chatId,
      )) {
        await record.set({ status: "skipped_anon_offline" }, { merge: true });
        return;
      }
    }

    const tokens = await db().collection("usuarios").doc(delivery.recipientUid)
      .collection("fcmTokens").where("enabled", "==", true).limit(20).get();
    const rows = tokens.docs
      .map((snap) => ({ ref: snap.ref, token: String(snap.data().token || "").trim() }))
      .filter((row) => Boolean(row.token));

    if (!rows.length) {
      await record.set({ status: "skipped_no_tokens" }, { merge: true });
      return;
    }
    ensureAdminApp();
    const notification: MulticastMessage = {
      tokens: rows.map((row) => row.token),
      data: {
        type: "chat_message",
        inboxKind: "anon_direct",
        href: "/chats",
        chatId,
        messageId,
        title: "Chat anónimo",
        body: anonDirectPushPreview(message),
        recipientUid: delivery.recipientUid,
        group: `chat-${chatId}`,
        tag: `chat-${chatId}`,
        channelId: "chat-messages-v2",
      },
      android: { priority: "high", collapseKey: `chat-${chatId}`, ttl: 0 },
      webpush: { headers: { Urgency: "high", TTL: "0" } },
    };
    try {
      const response = await messaging().sendEachForMulticast(notification);
      await record.set({
        status: response.successCount > 0 ? "sent" : "failed",
        successCount: response.successCount,
        failureCount: response.failureCount,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      for (let i = 0; i < response.responses.length; i++) {
        if (response.responses[i].success) continue;
        const code = String(response.responses[i].error?.code || "");
        if (code.includes("registration-token-not-registered") ||
            code.includes("invalid-registration-token")) {
          await rows[i].ref.delete().catch(() => undefined);
        }
      }
    } catch (error) {
      logger.error("anon direct push failure", { chatId, messageId, error });
      await record.set({ status: "failed" }, { merge: true });
    }
  },
);
