import { createHash } from "crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

setGlobalOptions({ region: "us-central1" });

function ensureApp() {
  if (!getApps().length) {
    initializeApp();
  }
}

function db(): Firestore {
  ensureApp();
  return getFirestore();
}

const FCM_CHANNEL_ID = "chat-messages-v2";
const MAX_TOKENS_PER_USER = 20;

type ChatDoc = {
  participantes?: string[];
  participants?: string[];
  targetUid?: string | null;
  receptorUid?: string | null;
  anonOwnerUid?: string | null;
  initiatorUid?: string | null;
  anonSessionId?: string | null;
  targetUsername?: string | null;
  receptorUsername?: string | null;
  anon?: boolean;
};

type MessageDoc = {
  fromUid?: string;
  ownerId?: string;
  senderUid?: string;
  senderKind?: string;
  profileUid?: string;
  texto?: string;
  text?: string;
  type?: string;
  mediaUrl?: string;
};

function asId(value: unknown) {
  return String(value || "").trim();
}

function formatAnonSessionLabel(sessionId: string) {
  const raw = asId(sessionId);
  if (!raw) return "Anónimo";
  if (!raw.startsWith("anon_")) return raw;
  const parts = raw.split("_").filter(Boolean);
  const token = parts[1] || parts[parts.length - 1] || "anon";
  return `Anon-${token.slice(0, 10)}`;
}

function messageAuthorId(data: MessageDoc) {
  return asId(data.fromUid || data.ownerId || data.senderUid);
}

function isFirebaseUid(id: string) {
  return Boolean(id) && !id.startsWith("anon_") && !id.startsWith("profile_");
}

function isOwnerReply(message: MessageDoc, chat: ChatDoc, from: string) {
  if (message.senderKind === "profile") return true;
  if (from.startsWith("profile_")) return true;
  const profileUid = asId(
    message.profileUid || chat.targetUid || chat.receptorUid || chat.anonOwnerUid,
  );
  return Boolean(profileUid && from === profileUid);
}

/** Recipients that can own FCM tokens (Firebase Auth UIDs only). */
export function resolvePushRecipientUids(message: MessageDoc, chat: ChatDoc): string[] {
  const from = messageAuthorId(message);
  const recipients = new Set<string>();
  const members = [...(chat.participantes || []), ...(chat.participants || [])]
    .map(asId)
    .filter(Boolean);

  if (!isOwnerReply(message, chat, from)) {
    for (const key of [chat.targetUid, chat.receptorUid, chat.anonOwnerUid]) {
      const uid = asId(key);
      if (isFirebaseUid(uid)) recipients.add(uid);
    }
    for (const id of members) {
      if (isFirebaseUid(id) && id !== from) recipients.add(id);
    }
  } else {
    const initiator = asId(chat.initiatorUid);
    if (isFirebaseUid(initiator)) recipients.add(initiator);
    for (const id of members) {
      if (!isFirebaseUid(id)) continue;
      if (id === from) continue;
      if (id === asId(chat.targetUid) || id === asId(chat.receptorUid)) continue;
      recipients.add(id);
    }
  }

  recipients.delete(from);
  if (from.startsWith("profile_")) {
    recipients.delete(from.slice("profile_".length));
  }

  return [...recipients].filter(isFirebaseUid);
}

export function notificationTitleForRecipient(
  message: MessageDoc,
  chat: ChatDoc,
  _recipientUid: string,
): string {
  const from = messageAuthorId(message);

  // Anon speaker → Anon-{alias}, never a real profile name/UID.
  if (from.startsWith("anon_")) {
    return formatAnonSessionLabel(from);
  }

  // Profile speaker → visible profile username only.
  if (isOwnerReply(message, chat, from) || from.startsWith("profile_")) {
    return asId(chat.targetUsername || chat.receptorUsername) || "Nuevo mensaje";
  }

  // Legacy peer threads: prefer profile usernames on the chat doc.
  return asId(chat.targetUsername || chat.receptorUsername) || "Nuevo mensaje";
}

export function notificationBodyFromMessage(message: MessageDoc): string {
  const text = asId(message.texto || message.text);
  if (text) return text.slice(0, 180);
  return "Nuevo mensaje";
}

function tokenDocId(token: string) {
  return createHash("sha256").update(token).digest("hex").slice(0, 40);
}

async function claimDelivery(chatId: string, messageId: string): Promise<boolean> {
  const ref = db().collection("pushDeliveries").doc(`${chatId}_${messageId}`);
  try {
    await ref.create({
      chatId,
      messageId,
      createdAt: FieldValue.serverTimestamp(),
      status: "pending",
    });
    return true;
  } catch (error: unknown) {
    const code = (error as { code?: number | string }).code;
    if (code === 6 || code === "already-exists") return false;
    throw error;
  }
}

async function markDelivery(
  chatId: string,
  messageId: string,
  patch: Record<string, unknown>,
) {
  await db()
    .collection("pushDeliveries")
    .doc(`${chatId}_${messageId}`)
    .set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function loadTokensForUid(uid: string): Promise<Array<{ id: string; token: string }>> {
  const snap = await db()
    .collection("usuarios")
    .doc(uid)
    .collection("fcmTokens")
    .where("enabled", "==", true)
    .limit(MAX_TOKENS_PER_USER)
    .get();

  const out: Array<{ id: string; token: string }> = [];
  for (const docSnap of snap.docs) {
    const token = asId(docSnap.data().token);
    if (token) out.push({ id: docSnap.id, token });
  }
  return out;
}

async function deleteInvalidToken(uid: string, docId: string) {
  await db().collection("usuarios").doc(uid).collection("fcmTokens").doc(docId).delete();
}

export const registerFcmToken = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const uid = request.auth.uid;
  const token = asId(request.data?.token);
  const installationId = asId(request.data?.installationId) || "unknown";
  const platform = asId(request.data?.platform) || "android";

  if (!token || token.length < 20) {
    throw new HttpsError("invalid-argument", "Invalid FCM token");
  }

  const id = tokenDocId(token);
  await db()
    .collection("usuarios")
    .doc(uid)
    .collection("fcmTokens")
    .doc(id)
    .set(
      {
        token,
        platform,
        installationId,
        enabled: true,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        appId: "com.sayittome.app",
      },
      { merge: true },
    );

  return { ok: true, id };
});

export const unregisterFcmToken = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const uid = request.auth.uid;
  const token = asId(request.data?.token);
  if (!token) return { ok: true };

  await db()
    .collection("usuarios")
    .doc(uid)
    .collection("fcmTokens")
    .doc(tokenDocId(token))
    .delete();

  return { ok: true };
});

export const onChatMessageCreated = onDocumentCreated(
  "chats/{chatId}/mensajes/{messageId}",
  async (event) => {
    const chatId = asId(event.params.chatId);
    const messageId = asId(event.params.messageId);
    const message = (event.data?.data() || {}) as MessageDoc;
    if (!chatId || !messageId) return;

    const claimed = await claimDelivery(chatId, messageId);
    if (!claimed) {
      logger.info("push skipped: already claimed", { chatId, messageId });
      return;
    }

    const chatSnap = await db().collection("chats").doc(chatId).get();
    const chat = (chatSnap.data() || {}) as ChatDoc;
    const recipients = resolvePushRecipientUids(message, chat);

    if (recipients.length === 0) {
      await markDelivery(chatId, messageId, {
        status: "skipped_no_recipients",
        recipientCount: 0,
      });
      return;
    }

    const body = notificationBodyFromMessage(message);
    let sent = 0;
    let failed = 0;
    const invalidDeleted: string[] = [];

    for (const recipientUid of recipients) {
      const tokens = await loadTokensForUid(recipientUid);
      if (tokens.length === 0) continue;

      const title = notificationTitleForRecipient(message, chat, recipientUid);
      ensureApp();
      const multicast: MulticastMessage = {
        tokens: tokens.map((row) => row.token),
        notification: {
          title,
          body,
        },
        data: {
          type: "chat_message",
          chatId,
          messageId,
          recipientUid,
        },
        android: {
          priority: "high",
          collapseKey: `chat-${chatId}`,
          notification: {
            channelId: FCM_CHANNEL_ID,
            tag: `chat-${chatId}`,
            sound: "whip",
            priority: "high",
            defaultVibrateTimings: true,
          },
        },
      };

      const response = await getMessaging().sendEachForMulticast(multicast);
      sent += response.successCount;
      failed += response.failureCount;

      response.responses.forEach((result, index) => {
        if (result.success) return;
        const code = result.error?.code || "";
        if (
          code.includes("registration-token-not-registered") ||
          code.includes("invalid-registration-token") ||
          code.includes("invalid-argument")
        ) {
          const row = tokens[index];
          if (row) {
            invalidDeleted.push(`${recipientUid}/${row.id}`);
            void deleteInvalidToken(recipientUid, row.id);
          }
        }
      });
    }

    await markDelivery(chatId, messageId, {
      status: sent > 0 ? "sent" : "skipped_no_tokens",
      recipientCount: recipients.length,
      successCount: sent,
      failureCount: failed,
      invalidDeleted,
    });

    logger.info("push delivery complete", {
      chatId,
      messageId,
      recipients: recipients.length,
      sent,
      failed,
    });
  },
);
