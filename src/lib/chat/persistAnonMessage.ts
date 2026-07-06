import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { buildLegacyProfileChatIds } from "@/lib/chat/anonChatId";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { migrateToCanonicalChat } from "@/lib/chat/migrate";
import { buildOutgoingChatMetaPatch } from "@/lib/chat/outgoingChatMeta";
import {
  profileReplyAuthorId,
  type ProfileAnonSenderKind,
} from "@/lib/chat/profileAnonMessageAuthor";
import { registerSessionChat } from "@/lib/chat/sessionChats";
import { scheduleModerationActivityTouch } from "@/lib/moderation/touchModerationActivity";
import { db } from "@/lib/firebase";

type PersistAnonMessageInput = {
  chatId: string;
  username: string;
  senderId: string;
  currentUid: string;
  targetUid: string;
  targetPhoto: string;
  messageText: string;
  /** Inbox preview line; defaults to messageText. For media, keep messageText empty. */
  lastMessagePreview?: string;
  /** Skip the pre-write chat read when the open thread already has metadata. */
  existingChatData?: Record<string, unknown>;
  reply?: string;
  storyReply?: {
    storyId: string;
    mediaUrl?: string;
    mediaType?: string;
    ownerUsername?: string;
  };
  type?: "text" | "audio" | "image" | "video";
  mediaUrl?: string;
  source?: "camera" | "gallery" | "audio";
  viewOnce?: boolean;
  autoModerationRequiresBlur?: boolean;
  moderationRequiresBlur?: boolean;
  moderationScore?: number;
  moderationUncertain?: boolean;
  moderationScannedAt?: string;
  moderationModel?: string;
  clientId?: string;
};

function resolveProfileAnonUnreadRecipients(input: {
  isOwnerReply: boolean;
  messageAuthorId: string;
  targetUid: string;
  participantes: string[];
  anonSessionId: string;
  senderId: string;
}) {
  if (!input.isOwnerReply) {
    const recipients = new Set<string>();
    if (input.targetUid) recipients.add(input.targetUid);

    for (const id of input.participantes) {
      if (!id.startsWith("anon_") && id !== input.messageAuthorId) {
        recipients.add(id);
      }
    }

    return [...recipients];
  }

  const recipients = new Set<string>();
  if (input.anonSessionId.startsWith("anon_")) recipients.add(input.anonSessionId);
  if (input.senderId.startsWith("anon_")) recipients.add(input.senderId);

  const liveAnonId = getChatAnonSenderId();
  if (liveAnonId.startsWith("anon_")) recipients.add(liveAnonId);

  for (const id of input.participantes) {
    if (id.startsWith("anon_") && id !== input.messageAuthorId) {
      recipients.add(id);
    }
  }

  return [...recipients];
}

export async function persistAnonChatMessage(input: PersistAnonMessageInput) {
  const {
    chatId,
    username,
    senderId,
    currentUid,
    targetUid,
    targetPhoto,
    messageText,
    reply,
    type = "text",
    mediaUrl,
    source,
    viewOnce,
  } = input;

  const storedText = type === "text" ? messageText : "";
  const lastMessagePreview = input.lastMessagePreview ?? messageText;

  const isOwnerReply = Boolean(
    currentUid && targetUid && currentUid === targetUid,
  );
  const senderKind: ProfileAnonSenderKind = isOwnerReply ? "profile" : "anon";
  const messageAuthorId = isOwnerReply ? profileReplyAuthorId(targetUid) : senderId;

  const chatRef = doc(db, "chats", chatId);
  let existingData = input.existingChatData || {};

  if (!input.existingChatData) {
    const existingSnap = await getDoc(chatRef);
    existingData = existingSnap.exists()
      ? (existingSnap.data() as Record<string, unknown>)
      : {};
  }

  const existingParticipantes = Array.isArray(existingData.participantes)
    ? existingData.participantes.map((entry) => String(entry)).filter(Boolean)
    : [];

  const participantes = Array.from(
    new Set([
      ...existingParticipantes,
      senderId,
      ...(currentUid ? [currentUid] : []),
      ...(targetUid ? [targetUid] : []),
      ...(getChatAnonSenderId().startsWith("anon_") ? [getChatAnonSenderId()] : []),
    ].filter(Boolean)),
  );

  const storedAnonSession = String(existingData.anonSessionId || "").trim();
  const anonSessionId =
    storedAnonSession.startsWith("anon_") ? storedAnonSession : senderId;
  const unreadRecipients = resolveProfileAnonUnreadRecipients({
    isOwnerReply,
    messageAuthorId,
    targetUid,
    participantes,
    anonSessionId,
    senderId,
  });

  const existingInitiatorUid = String(existingData.initiatorUid || "").trim();
  const initiatorUid = isOwnerReply
    ? existingInitiatorUid || null
    : currentUid || null;

  const legacyIds = [
    ...buildLegacyProfileChatIds(senderId, username, targetUid),
    ...(currentUid ? buildLegacyProfileChatIds(currentUid, username, targetUid) : []),
  ];

  const chatMeta = {
    id: chatId,
    targetUsername: username,
    receptorUsername: username,
    receptorUid: targetUid || null,
    targetUid: targetUid || null,
    initiatorUid,
    anonOwnerUid: targetUid || null,
    anonSessionId,
    participantes,
    anon: true,
    senderIsAnonymous: !isOwnerReply,
    canonicalChatId: chatId,
    schemaVersion: 2,
    targetPhoto: targetPhoto || null,
    ...buildOutgoingChatMetaPatch(messageAuthorId, unreadRecipients, {
      lastMessage: lastMessagePreview,
      lastMessageSender: messageAuthorId,
    }),
  };

  registerSessionChat(chatId);

  const messageRef = doc(collection(db, "chats", chatId, "mensajes"));
  const messagePayload = {
    texto: storedText,
    text: storedText,
    createdAt: serverTimestamp(),
    fromUid: messageAuthorId,
    ownerId: messageAuthorId,
    senderKind,
    ...(isOwnerReply && targetUid ? { profileUid: targetUid } : {}),
    [`readBy.${messageAuthorId}`]: true,
    ...(reply ? { reply } : {}),
    ...(input.storyReply ? { storyReply: input.storyReply } : {}),
    ...(type !== "text" ? { type } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(source ? { source } : {}),
    ...(viewOnce ? { viewOnce: true } : {}),
    ...(input.autoModerationRequiresBlur != null
      ? { autoModerationRequiresBlur: input.autoModerationRequiresBlur }
      : {}),
    ...(input.moderationRequiresBlur != null
      ? { moderationRequiresBlur: input.moderationRequiresBlur }
      : {}),
    ...(input.moderationScore != null ? { moderationScore: input.moderationScore } : {}),
    ...(input.moderationUncertain != null
      ? { moderationUncertain: input.moderationUncertain }
      : {}),
    ...(input.moderationScannedAt ? { moderationScannedAt: input.moderationScannedAt } : {}),
    ...(input.moderationModel ? { moderationModel: input.moderationModel } : {}),
    ...(input.clientId ? { clientId: input.clientId } : {}),
  };

  const batch = writeBatch(db);
  batch.set(chatRef, chatMeta, { merge: true });
  batch.set(messageRef, messagePayload);
  await batch.commit();

  void migrateToCanonicalChat(chatId, legacyIds, chatMeta).catch((error) => {
    console.error("chat migrate", chatId, error);
  });

  scheduleModerationActivityTouch({
    id: chatId,
    targetUsername: username,
    receptorUsername: username,
    receptorUid: targetUid || undefined,
    targetUid: targetUid || undefined,
    initiatorUid: currentUid || undefined,
    anonOwnerUid: targetUid || undefined,
    anonSessionId,
    lastMessage: lastMessagePreview,
    lastMessageSender: messageAuthorId,
    anon: true,
    senderIsAnonymous: !isOwnerReply,
  });
}
