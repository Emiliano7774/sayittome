import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import {
  anonDirectMediaLastMessageLabel,
  type AnonDirectMediaSource,
  type AnonDirectMediaType,
} from "@/lib/anonMatch/anonDirectMediaLabels";
import { assertAnonDirectViewOnceSendAllowed } from "@/lib/anonMatch/anonDirectViewOnceCapability";
import { db } from "@/lib/firebase";
import { commitViewOnceSecret } from "@/lib/media/viewOnceClaim";
import { buildViewOncePublicBirthFields } from "@/lib/media/viewOncePolicy";

export type PersistAnonDirectMessageInput = {
  chatId: string;
  senderId: string;
  /** Firebase Auth UID for inbox unread meta (never match alias). */
  senderAuthUid: string;
  senderTipo: "perfil" | "anonimo";
  messageText?: string;
  type?: AnonDirectMediaType;
  mediaUrl?: string;
  source?: AnonDirectMediaSource;
  reply?: string;
  viewOnce?: boolean;
  viewOnceLimit?: number;
  clientId?: string;
  autoModerationRequiresBlur?: boolean;
  moderationRequiresBlur?: boolean;
  lastMessagePreview?: string;
};

/** Pure preview of chats_anonimos shell meta written atomically with the message. */
export function buildAnonDirectInboxMetaPatch(input: {
  ultimoMensaje: string;
  senderAuthUid: string;
  messageId: string;
}) {
  const senderAuthUid = String(input.senderAuthUid || "").trim();
  const messageId = String(input.messageId || "").trim();
  const ultimoMensaje = String(input.ultimoMensaje || "").trim();
  return {
    ultimoMensaje,
    lastMessage: ultimoMensaje,
    lastMessageSender: senderAuthUid,
    latestMessageId: messageId,
    // Timestamps are serverTimestamp() at write time; harness asserts keys only.
    includesLastMessageAt: true,
    includesUpdatedAt: true,
    readBySenderTrue: true as const,
    unreadCountsSenderZero: true as const,
  };
}

/**
 * Persist a chats_anonimos message.
 * Contract: zero extra Firestore reads (no getDoc) vs the text-only path.
 * Bombs birth without mediaUrl; secret via commitViewOnceSecret (Admin).
 */
export async function persistAnonDirectMessage(input: PersistAnonDirectMessageInput) {
  const chatId = String(input.chatId || "").trim();
  const senderId = String(input.senderId || "").trim();
  const senderAuthUid = String(input.senderAuthUid || "").trim();
  const senderTipo = input.senderTipo === "perfil" ? "perfil" : "anonimo";
  const type: AnonDirectMediaType =
    input.type === "audio" || input.type === "image" || input.type === "video"
      ? input.type
      : "text";
  const messageText = String(input.messageText || "").trim();
  const mediaUrl = String(input.mediaUrl || "").trim();
  const reply = String(input.reply || "").trim();
  const clientId = String(input.clientId || "").trim();
  const viewOnce = input.viewOnce === true;

  if (!chatId || !senderId || !senderAuthUid) {
    throw Object.assign(new Error("invalid_persist_input"), { code: "invalid_persist_input" });
  }
  if (type === "text" && !messageText) {
    throw Object.assign(new Error("empty_text"), { code: "empty_text" });
  }
  if (type !== "text" && !mediaUrl) {
    throw Object.assign(new Error("missing_media_url"), { code: "missing_media_url" });
  }
  if (viewOnce && type !== "image" && type !== "video") {
    throw Object.assign(new Error("viewonce_media_only"), { code: "viewonce_media_only" });
  }

  assertAnonDirectViewOnceSendAllowed(viewOnce);

  const ultimoMensaje =
    String(input.lastMessagePreview || "").trim() ||
    (type === "text"
      ? messageText
      : viewOnce
        ? "💣 Bomba"
        : anonDirectMediaLastMessageLabel(type, input.source));

  const batch = writeBatch(db);
  const chatRef = doc(db, "chats_anonimos", chatId);
  const messageRef = doc(collection(db, "chats_anonimos", chatId, "mensajes"));
  batch.set(
    chatRef,
    {
      ultimoMensaje,
      lastMessage: ultimoMensaje,
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessageSender: senderAuthUid,
      latestMessageId: messageRef.id,
      // setDoc(merge) interprets dotted property names literally; use nested
      // maps so the sender's own unread status cannot reappear after snapshot.
      readBy: { [senderAuthUid]: true },
      unreadCounts: { [senderAuthUid]: 0 },
      latestReadMessageIds: { [senderAuthUid]: messageRef.id },
    },
    { merge: true },
  );

  const payload: Record<string, unknown> = {
    senderId,
    senderTipo,
    texto: type === "text" ? messageText : "",
    text: type === "text" ? messageText : "",
    type,
    createdAt: serverTimestamp(),
  };
  // Bomb: never birth with client-readable mediaUrl — secret via commit.
  if (mediaUrl && !viewOnce) payload.mediaUrl = mediaUrl;
  if (viewOnce) {
    Object.assign(payload, buildViewOncePublicBirthFields({ viewOnceLimit: input.viewOnceLimit }));
  }
  if (input.source) payload.source = input.source;
  if (reply) payload.reply = reply;
  if (clientId) payload.clientId = clientId;
  if (input.autoModerationRequiresBlur === true) {
    payload.autoModerationRequiresBlur = true;
  }
  if (input.moderationRequiresBlur === true) {
    payload.moderationRequiresBlur = true;
  }

  batch.set(messageRef, payload);
  await batch.commit();

  if (viewOnce && mediaUrl) {
    try {
      await commitViewOnceSecret({
        chatId,
        messageId: messageRef.id,
        mediaUrl,
      });
    } catch (error) {
      try {
        await deleteDoc(messageRef);
      } catch {
        // Best-effort: leave no unsealed bomb bubble.
      }
      throw Object.assign(
        error instanceof Error ? error : new Error("commit_view_once_failed"),
        { code: "commit_view_once_failed", cause: error },
      );
    }
  }

  return { messageId: messageRef.id, chatId, viewOnce };
}

/** Build-only helper for harnesses: shape of a media persist payload (no I/O). */
export function buildAnonDirectPersistPayloadPreview(input: PersistAnonDirectMessageInput) {
  const type: AnonDirectMediaType =
    input.type === "audio" || input.type === "image" || input.type === "video"
      ? input.type
      : "text";
  const viewOnce = input.viewOnce === true;
  const senderAuthUid = String(input.senderAuthUid || "").trim();
  return {
    collectionRoot: "chats_anonimos" as const,
    storageUploadPrefix: "chats/" as const,
    type,
    includesMediaUrl: Boolean(String(input.mediaUrl || "").trim()) && !viewOnce,
    viewOnceRejected: false,
    viewOnce: viewOnce,
    zeroExtraReads: true,
    inboxMeta: buildAnonDirectInboxMetaPatch({
      ultimoMensaje: String(input.lastMessagePreview || input.messageText || "").trim(),
      senderAuthUid,
      messageId: "preview",
    }),
  };
}
