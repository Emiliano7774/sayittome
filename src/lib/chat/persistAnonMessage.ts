import {
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { buildLegacyProfileChatIds } from "@/lib/chat/anonChatId";
import { migrateToCanonicalChat } from "@/lib/chat/migrate";
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
};

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

  const isOwnerReply = Boolean(
    currentUid && targetUid && currentUid === targetUid,
  );
  const senderKind: ProfileAnonSenderKind = isOwnerReply ? "profile" : "anon";
  const messageAuthorId = isOwnerReply ? profileReplyAuthorId(targetUid) : senderId;

  const chatRef = doc(db, "chats", chatId);
  const existingSnap = await getDoc(chatRef);
  const existingData = existingSnap.exists()
    ? (existingSnap.data() as Record<string, unknown>)
    : {};

  const existingParticipantes = Array.isArray(existingData.participantes)
    ? existingData.participantes.map((entry) => String(entry)).filter(Boolean)
    : [];

  const participantes = Array.from(
    new Set([
      ...existingParticipantes,
      senderId,
      ...(currentUid ? [currentUid] : []),
      ...(targetUid ? [targetUid] : []),
    ].filter(Boolean)),
  );

  const storedAnonSession = String(existingData.anonSessionId || "").trim();
  const anonSessionId =
    storedAnonSession.startsWith("anon_") ? storedAnonSession : senderId;
  const unreadRecipientUid = isOwnerReply
    ? storedAnonSession.startsWith("anon_")
      ? storedAnonSession
      : senderId
    : targetUid;

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
    lastMessage: messageText,
    lastMessageSender: messageAuthorId,
    updatedAt: serverTimestamp(),
    [`readBy.${messageAuthorId}`]: true,
    [`typing.${messageAuthorId}`]: false,
    ...(unreadRecipientUid
      ? {
          [`unreadCounts.${unreadRecipientUid}`]: increment(1),
          [`readBy.${unreadRecipientUid}`]: false,
        }
      : {}),
  };

  registerSessionChat(chatId);

  const messageRef = doc(collection(db, "chats", chatId, "mensajes"));
  const messagePayload = {
    texto: messageText,
    text: messageText,
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
    lastMessage: messageText,
    lastMessageSender: messageAuthorId,
    anon: true,
    senderIsAnonymous: !isOwnerReply,
  });
}
