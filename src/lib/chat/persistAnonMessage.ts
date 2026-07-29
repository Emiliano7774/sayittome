import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import {
  buildLegacyProfileChatIds,
  isProfileAnonChatId,
  parseProfileAnonChatId,
} from "@/lib/chat/anonChatId";
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
import { recordQaCriticalEvent } from "@/lib/qa/realDeviceQaDebug";

type PersistAnonMessageInput = {
  chatId: string;
  username: string;
  senderId: string;
  currentUid: string;
  targetUid: string;
  targetPhoto: string;
  messageText: string;
  /** Skip the pre-write chat read when the open thread already has metadata. */
  existingChatData?: Record<string, unknown>;
  /** Explicit owner/profile reply — must match UI isOwnerViewing, not only uid==targetUid. */
  isOwnerReply?: boolean;
  /** Inbox preview line; defaults to messageText. For media, keep messageText empty. */
  lastMessagePreview?: string;
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

function resolveThreadAnonRecipientIds(input: {
  chatId: string;
  anonSessionId: string;
  senderId: string;
  participantes: string[];
  messageAuthorId: string;
}) {
  const recipients = new Set<string>();
  // Owner's live browser anon must never be treated as the visitor recipient.
  const ownerLiveAnon = getChatAnonSenderId();
  const chatIdAnon =
    isProfileAnonChatId(input.chatId) &&
    parseProfileAnonChatId(input.chatId).senderId.startsWith("anon_")
      ? parseProfileAnonChatId(input.chatId).senderId
      : "";

  const addAnon = (value: string) => {
    const id = String(value || "").trim();
    if (!id.startsWith("anon_") || id === input.messageAuthorId) return;
    // Exclude the profile owner's live session unless it is the chatId visitor.
    if (id === ownerLiveAnon && id !== chatIdAnon) return;
    recipients.add(id);
  };

  // Canonical visitor from chatId first — required for profile→anon unread.
  addAnon(chatIdAnon);
  // Visitor thread identity only — never the profile owner's live browser anon
  // session (that poisoned unreadCounts and hid the visitor badge/row).
  if (input.anonSessionId !== ownerLiveAnon || input.anonSessionId === chatIdAnon) {
    addAnon(input.anonSessionId);
  }
  addAnon(input.senderId);

  for (const id of input.participantes) {
    addAnon(id);
  }

  // Fail-closed: owner reply must always dirty the chatId visitor key.
  if (chatIdAnon) recipients.add(chatIdAnon);

  return [...recipients];
}

function resolveProfileAnonUnreadRecipients(input: {
  isOwnerReply: boolean;
  messageAuthorId: string;
  targetUid: string;
  participantes: string[];
  anonSessionId: string;
  senderId: string;
  chatId: string;
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

  return resolveThreadAnonRecipientIds(input);
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

  const chatRef = doc(db, "chats", chatId);
  let existingData = input.existingChatData || {};

  if (!input.existingChatData) {
    const existingSnap = await getDoc(chatRef);
    existingData = existingSnap.exists()
      ? (existingSnap.data() as Record<string, unknown>)
      : {};
  }

  const ownerUidFromDoc = String(
    existingData.receptorUid ||
      existingData.targetUid ||
      existingData.anonOwnerUid ||
      "",
  ).trim();
  const resolvedTargetUid = String(targetUid || ownerUidFromDoc || "").trim();
  const inferredOwnerReply = Boolean(
    currentUid && resolvedTargetUid && currentUid === resolvedTargetUid,
  );
  // Explicit false must not beat uid match during mount races (owner reply
  // misclassified as visitor → anon sees own lastMessageSender). Trust
  // explicit true, or inferred owner from hydrated/doc uid.
  const isOwnerReply =
    inferredOwnerReply || input.isOwnerReply === true;
  const senderKind: ProfileAnonSenderKind = isOwnerReply ? "profile" : "anon";
  const messageAuthorId = isOwnerReply
    ? profileReplyAuthorId(resolvedTargetUid)
    : senderId;

  const existingParticipantes = Array.isArray(existingData.participantes)
    ? existingData.participantes.map((entry) => String(entry)).filter(Boolean)
    : [];

  const liveBrowserAnon = getChatAnonSenderId();
  const storedAnonSession = String(existingData.anonSessionId || "").trim();
  const chatIdAnon =
    isProfileAnonChatId(chatId) &&
    parseProfileAnonChatId(chatId).senderId.startsWith("anon_")
      ? parseProfileAnonChatId(chatId).senderId
      : "";
  const senderAnon = senderId.startsWith("anon_") ? senderId : "";
  // Only the visitor thread may inject the live browser anon id. Owner replies
  // must not rewrite participantes/anonSessionId with the profile browser session.
  const participantes = Array.from(
    new Set([
      ...existingParticipantes,
      // Owner replies: keep visitor anon from senderId/chatId, never live owner session.
      ...(senderAnon ? [senderAnon] : isOwnerReply ? [] : [senderId]),
      ...(currentUid ? [currentUid] : []),
      ...(resolvedTargetUid ? [resolvedTargetUid] : []),
      ...(!isOwnerReply && liveBrowserAnon.startsWith("anon_")
        ? [liveBrowserAnon]
        : []),
      ...(chatIdAnon ? [chatIdAnon] : []),
    ].filter(Boolean)),
  );

  const anonSessionId = isOwnerReply
    ? // Prefer chatId visitor; never keep a poisoned owner-live anonSessionId.
      chatIdAnon ||
      (storedAnonSession.startsWith("anon_") &&
      storedAnonSession !== liveBrowserAnon
        ? storedAnonSession
        : "") ||
      senderAnon
    : storedAnonSession.startsWith("anon_")
      ? storedAnonSession
      : senderAnon || chatIdAnon || liveBrowserAnon;

  const unreadRecipients = resolveProfileAnonUnreadRecipients({
    isOwnerReply,
    messageAuthorId,
    targetUid: resolvedTargetUid,
    participantes,
    anonSessionId,
    senderId: senderAnon || anonSessionId,
    chatId,
  });

  const existingInitiatorUid = String(existingData.initiatorUid || "").trim();
  const initiatorUid = isOwnerReply
    ? existingInitiatorUid || null
    : currentUid || null;

  const legacyIds = [
    ...buildLegacyProfileChatIds(senderId, username, resolvedTargetUid),
    ...(currentUid
      ? buildLegacyProfileChatIds(currentUid, username, resolvedTargetUid)
      : []),
  ];
  const messageRef = doc(collection(db, "chats", chatId, "mensajes"));

  const chatMeta = {
    id: chatId,
    targetUsername: username,
    receptorUsername: username,
    receptorUid: resolvedTargetUid || null,
    targetUid: resolvedTargetUid || null,
    initiatorUid,
    anonOwnerUid: resolvedTargetUid || null,
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
      latestMessageId: messageRef.id,
      latestSenderKind: senderKind,
      latestSenderAnonSessionId:
        senderKind === "anon" ? senderAnon || anonSessionId : "",
    }),
  };

  registerSessionChat(chatId);

  const messagePayload = {
    texto: storedText,
    text: storedText,
    createdAt: serverTimestamp(),
    fromUid: messageAuthorId,
    ownerId: messageAuthorId,
    senderKind,
    ...(isOwnerReply && resolvedTargetUid
      ? { profileUid: resolvedTargetUid }
      : {}),
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
  recordQaCriticalEvent("chat", "CHAT_MESSAGE_PERSISTED", {
    threadId: chatId,
    latestMessageId: messageRef.id,
    senderKind,
    senderUid: messageAuthorId,
    anonRecipientIds: unreadRecipients.filter((id) => id.startsWith("anon_")),
    unreadRecipientCount: unreadRecipients.length,
  });

  void migrateToCanonicalChat(chatId, legacyIds, chatMeta).catch((error) => {
    console.error("chat migrate", chatId, error);
  });

  scheduleModerationActivityTouch({
    id: chatId,
    targetUsername: username,
    receptorUsername: username,
    receptorUid: resolvedTargetUid || undefined,
    targetUid: resolvedTargetUid || undefined,
    initiatorUid: currentUid || undefined,
    anonOwnerUid: resolvedTargetUid || undefined,
    anonSessionId,
    lastMessage: lastMessagePreview,
    lastMessageSender: messageAuthorId,
    anon: true,
    senderIsAnonymous: !isOwnerReply,
  });
}
