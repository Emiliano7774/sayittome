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
import {
  buildOutgoingChatMetaPatch,
  expandOutgoingChatMetaPatchForSet,
} from "@/lib/chat/outgoingChatMeta";
import { buildCanonicalSender } from "@/lib/chat/canonicalSender";
import { type ProfileAnonSenderKind } from "@/lib/chat/profileAnonMessageAuthor";
import { registerSessionChat } from "@/lib/chat/sessionChats";
import { scheduleModerationActivityTouch } from "@/lib/moderation/touchModerationActivity";
import { db } from "@/lib/firebase";
import { recordQaCriticalEvent } from "@/lib/qa/realDeviceQaDebug";
import {
  buildStoryReplyPersistPatch,
  commitWithStoryReplyRulesFallback,
  isFirestorePermissionDenied,
} from "@/lib/stories/storyReplySnapshot";
import { buildViewOncePublicBirthFields } from "@/lib/media/viewOncePolicy";

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
  /** Logged-in profile username; used to detect owner via chatId slug on cold start. */
  viewerUsername?: string;
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
  viewOnceLimit?: number;
  autoModerationRequiresBlur?: boolean;
  moderationRequiresBlur?: boolean;
  moderationScore?: number;
  moderationUncertain?: boolean;
  moderationScannedAt?: string;
  moderationModel?: string;
  clientId?: string;
};

const canonicalMigrationStarted = new Set<string>();

export function resolvePersistAnonMessageType(
  type?: PersistAnonMessageInput["type"],
): NonNullable<PersistAnonMessageInput["type"]> {
  if (type === "audio" || type === "image" || type === "video") return type;
  return "text";
}

export class PersistIdentityError extends Error {
  constructor(message = "owner_identity_not_ready") {
    super(message);
    this.name = "PersistIdentityError";
  }
}

export function hasUsableChatData(data?: Record<string, unknown> | null) {
  return Boolean(data && Object.keys(data).length > 0);
}

/** Author id is never derived from late targetUid. Owner → profile_{currentUid}. */
export function resolvePersistMessageAuthor(input: {
  chatId: string;
  currentUid: string;
  targetUid?: string;
  senderId: string;
  viewerUsername?: string;
  isOwnerReply?: boolean;
  authReady?: boolean;
}) {
  const built = buildCanonicalSender({
    authReady: input.authReady !== false,
    liveProfileUid: input.currentUid,
    threadAnonId: input.senderId,
    liveAnonId: input.senderId,
    chatId: input.chatId,
    viewerUsername: input.viewerUsername,
    profileUid: input.targetUid,
    explicitOwner: input.isOwnerReply,
  });

  if (!built.ok) {
    const isOwner = built.error === "owner_identity_not_ready";
    return {
      ok: false as const,
      error: built.error,
      isOwnerReply: isOwner,
      senderKind: (isOwner ? "profile" : "anon") as ProfileAnonSenderKind,
      messageAuthorId: "",
      senderAuthUid: "",
      senderProfileId: "",
      senderRole: (isOwner ? "profile" : "anon") as ProfileAnonSenderKind,
    };
  }

  return {
    ok: true as const,
    isOwnerReply: built.sender.senderRole === "profile",
    senderKind: built.sender.senderKind,
    messageAuthorId: built.sender.fromUid,
    senderAuthUid: built.sender.senderAuthUid,
    senderProfileId: built.sender.senderProfileId,
    senderRole: built.sender.senderRole,
  };
}

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

export async function persistAnonChatMessage(
  input: PersistAnonMessageInput,
): Promise<{ messageId: string; canonicalChatId: string }> {
  const {
    chatId,
    username,
    senderId,
    currentUid,
    targetUid,
    targetPhoto,
    messageText,
    reply,
    type: persistType,
    mediaUrl,
    source,
    viewOnce,
  } = input;
  const type = resolvePersistAnonMessageType(persistType);

  const storedText = type === "text" ? messageText : "";
  const storyReplyPersist = buildStoryReplyPersistPatch({
    messageText: storedText || messageText,
    storyReply: input.storyReply,
    reply,
  });
  const lastMessagePreview =
    input.lastMessagePreview ?? storyReplyPersist.lastMessagePreview;

  const requestedChatRef = doc(db, "chats", chatId);
  let existingData = input.existingChatData || {};

  if (!hasUsableChatData(input.existingChatData)) {
    try {
      const existingSnap = await getDoc(requestedChatRef);
      existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : {};
    } catch (error) {
      // Missing-doc reads can fail closed under participant rules. Treat as
      // a new thread and continue with the create/merge write.
      if (!isFirestorePermissionDenied(error)) throw error;
      existingData = {};
    }
  }

  const storedCanonicalChatId = String(existingData.canonicalChatId || "").trim();
  const canonicalChatId =
    storedCanonicalChatId &&
    storedCanonicalChatId !== chatId &&
    isProfileAnonChatId(storedCanonicalChatId)
      ? storedCanonicalChatId
      : chatId;
  const chatRef = doc(db, "chats", canonicalChatId);

  // Alias bridges are exceptional and bounded to one extra document read. The
  // actual message and summary must always be written to the same canonical
  // thread that the receiver listens to.
  if (canonicalChatId !== chatId) {
    try {
      const canonicalSnap = await getDoc(chatRef);
      if (canonicalSnap.exists()) {
        existingData = {
          ...existingData,
          ...(canonicalSnap.data() as Record<string, unknown>),
        };
      }
    } catch (error) {
      if (!isFirestorePermissionDenied(error)) throw error;
    }
  }

  const ownerUidFromDoc = String(
    existingData.receptorUid ||
      existingData.targetUid ||
      existingData.anonOwnerUid ||
      "",
  ).trim();
  const resolvedTargetUid = String(targetUid || ownerUidFromDoc || "").trim();
  const persistAuthor = resolvePersistMessageAuthor({
    chatId: canonicalChatId,
    currentUid,
    targetUid: resolvedTargetUid,
    senderId,
    viewerUsername: input.viewerUsername,
    isOwnerReply: input.isOwnerReply,
  });
  if (!persistAuthor.ok) {
    throw new PersistIdentityError(persistAuthor.error);
  }
  const isOwnerReply = persistAuthor.isOwnerReply;
  const senderKind: ProfileAnonSenderKind = persistAuthor.senderKind;
  const messageAuthorId = persistAuthor.messageAuthorId;

  const existingParticipantes = Array.isArray(existingData.participantes)
    ? existingData.participantes.map((entry) => String(entry)).filter(Boolean)
    : [];

  const liveBrowserAnon = getChatAnonSenderId();
  const storedAnonSession = String(existingData.anonSessionId || "").trim();
  const chatIdAnon =
    isProfileAnonChatId(canonicalChatId) &&
    parseProfileAnonChatId(canonicalChatId).senderId.startsWith("anon_")
      ? parseProfileAnonChatId(canonicalChatId).senderId
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
    chatId: canonicalChatId,
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
    ...(chatId !== canonicalChatId ? [chatId] : []),
  ];
  const messageRef = doc(collection(db, "chats", canonicalChatId, "mensajes"));

  const chatMeta = {
    id: canonicalChatId,
    targetUsername: username,
    receptorUsername: username,
    ...(resolvedTargetUid
      ? {
          receptorUid: resolvedTargetUid,
          targetUid: resolvedTargetUid,
          anonOwnerUid: resolvedTargetUid,
        }
      : {}),
    initiatorUid,
    anonSessionId,
    participantes,
    anon: true,
    senderIsAnonymous: !isOwnerReply,
    canonicalChatId,
    schemaVersion: 2,
    targetPhoto: targetPhoto || null,
    ...expandOutgoingChatMetaPatchForSet(
      buildOutgoingChatMetaPatch(messageAuthorId, unreadRecipients, {
        lastMessage: lastMessagePreview,
        lastMessageSender: messageAuthorId,
        latestMessageId: messageRef.id,
        latestSenderKind: senderKind,
        latestSenderAnonSessionId:
          senderKind === "anon" ? senderAnon || anonSessionId : "",
      }),
    ),
  };

  registerSessionChat(canonicalChatId);

  const storyReply = storyReplyPersist.storyReply;
  const storedReply = storyReplyPersist.storedReply;

  const messagePayload = {
    texto: storedText,
    text: storedText,
    createdAt: serverTimestamp(),
    fromUid: messageAuthorId,
    ownerId: messageAuthorId,
    senderKind,
    senderAuthUid: persistAuthor.senderAuthUid || null,
    senderProfileId: persistAuthor.senderProfileId || null,
    senderRole: persistAuthor.senderRole,
    createdByAuthUid: currentUid || null,
    identityReadyAtWrite: true,
    ...(isOwnerReply && persistAuthor.senderProfileId
      ? { profileUid: persistAuthor.senderProfileId }
      : {}),
    readBy: { [messageAuthorId]: true },
    ...(storedReply ? { reply: storedReply } : {}),
    ...(storyReply ? { storyReply } : {}),
    type,
    // Bomb (viewOnce): never birth with client-readable mediaUrl — secret via commit.
    ...(mediaUrl && !viewOnce ? { mediaUrl } : {}),
    ...(source ? { source } : {}),
    ...(viewOnce ? buildViewOncePublicBirthFields({ viewOnceLimit: input.viewOnceLimit }) : {}),
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

  const writeStartedAt = Date.now();
  recordQaCriticalEvent("chat", "CHAT_MESSAGE_WRITE_START", {
    threadId: canonicalChatId,
    serverDocId: messageRef.id,
    clientId: input.clientId || "",
    senderKind,
    writeStartedAt,
  });

  async function commitPayload(payload: typeof messagePayload) {
    const batch = writeBatch(db);
    batch.set(chatRef, chatMeta, { merge: true });
    batch.set(messageRef, payload);
    await batch.commit();
  }

  await commitWithStoryReplyRulesFallback(messagePayload, commitPayload);
  const writeAckAt = Date.now();
  recordQaCriticalEvent("chat", "CHAT_MESSAGE_PERSISTED", {
    threadId: chatId,
    canonicalThreadId: canonicalChatId,
    latestMessageId: messageRef.id,
    serverDocId: messageRef.id,
    clientId: input.clientId || "",
    senderKind,
    senderUid: messageAuthorId,
    senderAuthUid: persistAuthor.senderAuthUid,
    senderRole: persistAuthor.senderRole,
    anonRecipientIds: unreadRecipients.filter((id) => id.startsWith("anon_")),
    unreadRecipientCount: unreadRecipients.length,
    writeStartedAt,
    writeAckAt,
    writeLatencyMs: writeAckAt - writeStartedAt,
  });

  if (viewOnce && mediaUrl) {
    const { commitViewOnceSecret } = await import("@/lib/media/viewOnceClaim");
    await commitViewOnceSecret({
      chatId: canonicalChatId,
      messageId: messageRef.id,
      mediaUrl,
    });
  }

  if (!canonicalMigrationStarted.has(canonicalChatId)) {
    canonicalMigrationStarted.add(canonicalChatId);
    void migrateToCanonicalChat(canonicalChatId, legacyIds, chatMeta).catch((error) => {
      canonicalMigrationStarted.delete(canonicalChatId);
      console.error("chat migrate", canonicalChatId, error);
    });
  }

  scheduleModerationActivityTouch({
    id: canonicalChatId,
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

  return { messageId: messageRef.id, canonicalChatId };
}
