import { createHash } from "crypto";

import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { type MulticastMessage } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { db, ensureAdminApp, messaging } from "./adminApp";

import { isValidFcmInstallationId, isValidInstallationProof } from "./fcmInstallation";
import {
  createReadBeforeWriteGuard,
  registerFcmTokenInTransaction,
  unregisterFcmTokenInTransaction,
} from "./fcmTokenTx";
import { resolvePushTitle } from "./pushNotificationCopy";
import { deleteStorageObject, handleDeleteChatMessage } from "./deleteChatMessage";
import { handleClaimViewOnceMedia, handleCommitViewOnceSecret, sealViewOnceMediaIfNeeded } from "./viewOnceClaim";
import {
  handleClaimVerifiedProfileLink,
  handleIssueVerifiedProfileLinkTicket,
  handleScrubVerifiedProfileAttestation,
  handleVerifyVerifiedProfileLink,
} from "./verifiedProfileLink";
import { VERIFIED_PROFILE_LINK_MAC_SECRET_NAME } from "./verifiedProfileLinkCore";

const verifiedProfileLinkMacSecret = defineSecret(VERIFIED_PROFILE_LINK_MAC_SECRET_NAME);

function readVerifiedProfileLinkMacSecret() {
  try {
    return String(verifiedProfileLinkMacSecret.value() || "");
  } catch {
    return "";
  }
}

export {
  assertDurableRateLimit,
  createReadBeforeWriteGuard,
  decideInstallationProofUpdate,
  isLegacyInstallationProof,
  registerFcmTokenInTransaction,
  unregisterFcmTokenInTransaction,
} from "./fcmTokenTx";
export { handleDeleteChatMessage } from "./deleteChatMessage";
export { db, ensureAdminApp, resolveAdminApp } from "./adminApp";
export {
  decideChatMessageDelete,
  isCanonicalMessageAuthor,
  isChatMember,
  isQuietEveryoneDeleteSummary,
  pickUniqueChatMessageLocation,
  tombstonePublicFields,
} from "./deleteChatMessageCore";

setGlobalOptions({ region: "us-central1" });

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
  senderRole?: string;
  senderAuthUid?: string;
  createdByAuthUid?: string;
  profileUid?: string;
  texto?: string;
  text?: string;
  type?: string;
  mediaUrl?: string;
  viewOnce?: boolean;
  viewOnceLimit?: number;
  viewOnceOpenedCount?: number;
  viewOnceExhausted?: boolean;
  viewOnceSealed?: boolean;
};

function asId(value: unknown) {
  return String(value || "").trim();
}

function messageAuthorId(data: MessageDoc) {
  return asId(data.fromUid || data.ownerId || data.senderUid);
}

function isFirebaseUid(id: string) {
  return Boolean(id) && !id.startsWith("anon_") && !id.startsWith("profile_");
}

function isOwnerReply(message: MessageDoc, chat: ChatDoc, from: string) {
  // fromUid shape wins over a contradictory senderKind (historical mis-tags).
  if (from.startsWith("anon_")) return false;
  if (from.startsWith("profile_")) return true;
  if (message.senderKind === "profile") return true;
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
  recipients.delete(asId(message.senderAuthUid));
  recipients.delete(asId(message.createdByAuthUid));
  if (from.startsWith("profile_")) {
    recipients.delete(from.slice("profile_".length));
  }

  return [...recipients].filter(isFirebaseUid);
}

export function notificationTitleForRecipient(
  message: MessageDoc,
  chat: ChatDoc,
  recipientUid: string,
): string {
  const from = messageAuthorId(message);
  const role = asId(message.senderRole);
  const profileName = asId(chat.targetUsername || chat.receptorUsername);
  const profileUid = asId(
    message.profileUid || chat.targetUid || chat.receptorUid || chat.anonOwnerUid,
  );

  // Immutable senderRole wins over historical fromUid shape.
  // Legacy role=anon must never surface a raw Firebase fromUid.
  if (role === "anon" || from.startsWith("anon_")) {
    return resolvePushTitle({
      senderRole: role || "anon",
      from: from.startsWith("anon_") ? from : "",
      fromUid: from.startsWith("anon_") ? from : "",
    });
  }

  if (role === "profile" || isOwnerReply(message, chat, from) || from.startsWith("profile_")) {
    return profileName || "Nuevo mensaje";
  }

  // Same-profile author (legacy bare Firebase fromUid).
  if (profileUid && from === profileUid) {
    return profileName || "Nuevo mensaje";
  }

  // Never attribute another peer's message to this chat's profile username.
  if (profileName && from && from !== profileUid && from !== asId(recipientUid)) {
    return "Nuevo mensaje";
  }

  return profileName || "Nuevo mensaje";
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

function firestoreFcmTx(tx: Transaction, firestore: Firestore) {
  const guard = createReadBeforeWriteGuard();
  return {
    async get(ref: { path: string }) {
      guard.assertCanRead();
      const snap = await tx.get(firestore.doc(ref.path));
      return { exists: snap.exists, data: () => (snap.data() || {}) as Record<string, unknown> };
    },
    delete(ref: { path: string }) {
      guard.markWrite();
      tx.delete(firestore.doc(ref.path));
    },
    set(ref: { path: string }, data: Record<string, unknown>) {
      guard.markWrite();
      tx.set(firestore.doc(ref.path), { ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    },
  };
}

export const registerFcmToken = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const uid = request.auth.uid;
  const token = asId(request.data?.token);
  const installationId = asId(request.data?.installationId);
  const proof = asId(request.data?.proof);
  const platform = asId(request.data?.platform) || "android";

  if (!token || token.length < 20) {
    throw new HttpsError("invalid-argument", "Invalid FCM token");
  }
  if (!isValidFcmInstallationId(installationId) || !isValidInstallationProof(proof)) {
    throw new HttpsError("invalid-argument", "Invalid installation proof");
  }

  const id = tokenDocId(token);
  const firestore = db();
  await firestore.runTransaction(async (tx) => {
    const result = await registerFcmTokenInTransaction(firestoreFcmTx(tx, firestore), {
      uid,
      tokenId: id,
      installationId,
      proof,
      tokenPayload: {
        token,
        platform,
        installationId,
        enabled: true,
        createdAt: FieldValue.serverTimestamp(),
        appId: "com.sayittome.app",
      },
    });
    if (!result.ok) {
      if (result.error === "rate_limited") {
        throw new HttpsError("resource-exhausted", "rate_limited");
      }
      if (result.error === "installation_proof_mismatch") {
        throw new HttpsError("permission-denied", "installation_proof_mismatch");
      }
      throw new HttpsError("invalid-argument", result.error || "register_failed");
    }
  });

  return { ok: true, id };
});

export const deleteChatMessage = onCall(async (request) => {
  return handleDeleteChatMessage(request, {
    db: db(),
    deleteStoragePath: deleteStorageObject,
  });
});

export const claimViewOnceMedia = onCall(async (request) => {
  ensureAdminApp();
  return handleClaimViewOnceMedia(request, { db: db() });
});

export const commitViewOnceSecret = onCall(async (request) => {
  ensureAdminApp();
  return handleCommitViewOnceSecret(request, { db: db() });
});

export const issueVerifiedProfileLinkTicket = onCall(
  { secrets: [verifiedProfileLinkMacSecret] },
  async (request) => {
    return handleIssueVerifiedProfileLinkTicket(request, db(), readVerifiedProfileLinkMacSecret());
  },
);

export const claimVerifiedProfileLink = onCall(
  { secrets: [verifiedProfileLinkMacSecret] },
  async (request) => {
    return handleClaimVerifiedProfileLink(request, db(), readVerifiedProfileLinkMacSecret());
  },
);

export const verifyVerifiedProfileLink = onCall(
  { secrets: [verifiedProfileLinkMacSecret] },
  async (request) => {
    return handleVerifyVerifiedProfileLink(request, db(), readVerifiedProfileLinkMacSecret());
  },
);

export const scrubVerifiedProfileLinkMensajes = onDocumentWritten(
  {
    document: "chats/{chatId}/mensajes/{messageId}",
    secrets: [verifiedProfileLinkMacSecret],
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const data = after.data() || {};
    await handleScrubVerifiedProfileAttestation({
      db: db(),
      secret: readVerifiedProfileLinkMacSecret(),
      chatId: String(event.params.chatId || ""),
      messageId: String(event.params.messageId || ""),
      attestation: data.verifiedProfileAttestation,
      messageText: String(data.texto || data.text || ""),
      messageAuthorUid: String(
        data.senderAuthUid || data.createdByAuthUid || data.profileUid || data.fromUid || "",
      ),
      messageRef: after.ref,
    });
  },
);

export const unregisterFcmToken = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const uid = request.auth.uid;
  const token = asId(request.data?.token);
  const installationId = asId(request.data?.installationId);
  const proof = asId(request.data?.proof);
  if (!token) return { ok: true };
  if (!isValidFcmInstallationId(installationId) || !isValidInstallationProof(proof)) {
    throw new HttpsError("invalid-argument", "Invalid installation proof");
  }

  const tokenId = tokenDocId(token);
  const firestore = db();
  await firestore.runTransaction(async (tx) => {
    const result = await unregisterFcmTokenInTransaction(firestoreFcmTx(tx, firestore), {
      uid,
      tokenId,
      installationId,
      proof,
      expectedUid: uid,
      validInstallationId: true,
    });
    if (result.error === "ownership_mismatch") {
      return;
    }
  });

  return { ok: true };
});

export const onChatMessageCreated = onDocumentCreated(
  "chats/{chatId}/mensajes/{messageId}",
  async (event) => {
    const chatId = asId(event.params.chatId);
    const messageId = asId(event.params.messageId);
    const message = (event.data?.data() || {}) as MessageDoc;
    if (!chatId || !messageId) return;

    if ((message as { viewOnce?: boolean }).viewOnce) {
      try {
        await sealViewOnceMediaIfNeeded(db(), chatId, messageId, message as MessageDoc);
      } catch (error) {
        logger.error("viewOnce seal failed", { chatId, messageId, error });
      }
    }

    const claimed = await claimDelivery(chatId, messageId);
    if (!claimed) {
      logger.info("push skipped: already claimed", { chatId, messageId });
      return;
    }

    const chatSnap = await db().collection("chats").doc(chatId).get();
    const chat = (chatSnap.data() || {}) as ChatDoc;

    // Anon→profile block: profile must not notify (and ideally not write) that anon.
    try {
      const anonFromChat = (() => {
        const marker = "__anon_to__";
        if (!chatId.includes(marker)) return "";
        const senderId = chatId.split(marker)[0] || "";
        return senderId.startsWith("anon_") ? senderId : "";
      })();
      const profileUid = asId(
        (chat as { receptorUid?: string }).receptorUid ||
          (chat as { targetUid?: string }).targetUid ||
          (chat as { anonOwnerUid?: string }).anonOwnerUid ||
          "",
      );
      const fromUid = asId(message.fromUid || message.senderAuthUid || "");
      const isProfileSender =
        Boolean(profileUid) &&
        (fromUid === profileUid || fromUid === `profile_${profileUid}`);
      if (isProfileSender && anonFromChat && profileUid) {
        const blockId = `${anonFromChat}__${profileUid}`;
        const blockSnap = await db().collection("anon_profile_blocks").doc(blockId).get();
        if (blockSnap.exists) {
          await markDelivery(chatId, messageId, {
            status: "skipped_blocked_by_anon",
            recipientCount: 0,
          });
          return;
        }
      }
    } catch (error) {
      logger.warn("anon_profile_block check failed", { chatId, messageId, error });
    }

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
      ensureAdminApp();
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
          // Client inbox/group key — do not collapse per-chat.
          group: `chat-${chatId}`,
          // Seed fields for cold notification open (string-only FCM data).
          body: String(body || "").slice(0, 180),
          title: String(title || "").slice(0, 80),
        },
        android: {
          priority: "high",
          // One expandable group per conversation — replace/update, do not stack bubbles.
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

      const response = await messaging().sendEachForMulticast(multicast);
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
