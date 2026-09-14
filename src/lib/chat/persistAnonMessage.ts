import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  runTransaction,
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
import { filterSameEpochLegacyIds } from "@/lib/abuse/profileAnonAbuseBlock";
import {
  buildProfileAnonAtomicSendBatch,
  buildProfileAnonChatWritePayload,
  buildProfileAnonMessagePayload,
} from "@/lib/chat/profileAnonSendPayload";
import { buildCanonicalSender } from "@/lib/chat/canonicalSender";
import { type ProfileAnonSenderKind } from "@/lib/chat/profileAnonMessageAuthor";
import { registerSessionChat } from "@/lib/chat/sessionChats";
import { scheduleModerationActivityTouch } from "@/lib/moderation/touchModerationActivity";
import { auth, db } from "@/lib/firebase";
import { recordQaCriticalEvent } from "@/lib/qa/realDeviceQaDebug";
import {
  buildStoryReplyPersistPatch,
  commitWithStoryReplyRulesFallback,
  isFirestorePermissionDenied,
} from "@/lib/stories/storyReplySnapshot";
import { buildViewOncePublicBirthFields } from "@/lib/media/viewOncePolicy";
import { ChatMediaSendError } from "@/lib/chat/chatMediaSendFailure";
import { issueProfileAnonAbuseSendPermit } from "@/lib/abuse/issueProfileAnonAbuseSendPermit";

function livePersistAuthUid(fallbackUid: string) {
  return String(auth.currentUser?.uid || fallbackUid || "").trim();
}

function firebaseErrorCode(error: unknown) {
  return String((error as { code?: string })?.code || (error as Error)?.message || "error");
}

async function rollbackFailedViewOnceSummary(input: {
  chatId: string;
  messageId: string;
  previous: Record<string, unknown>;
}) {
  const ref = doc(db, "chats", input.chatId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const live = snap.data() as Record<string, unknown>;
    if (String(live.latestMessageId || "") !== input.messageId) return;
    const keys = [
      "lastMessage", "lastMessageSender", "latestMessageId", "latestSenderKind",
      "latestSenderAnonSessionId", "lastMessageAt", "updatedAt", "unreadCounts", "readBy",
      "readAt", "latestReadMessageId", "latestReadMessageIds",
    ];
    const patch: Record<string, unknown> = {};
    for (const key of keys) {
      patch[key] = Object.prototype.hasOwnProperty.call(input.previous, key)
        ? input.previous[key]
        : deleteField();
    }
    tx.update(ref, patch);
  });
}

async function commitViewOnceSecretWithRetry(input: {
  chatId: string;
  messageId: string;
  mediaUrl: string;
}) {
  const { commitViewOnceSecret } = await import("@/lib/media/viewOnceClaim");
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await commitViewOnceSecret(input);
    } catch (error) {
      lastError = error;
      const code = String((error as { code?: string })?.code || "");
      if (
        code.includes("already-exists") ||
        code.includes("permission-denied") ||
        code.includes("unauthenticated") ||
        code.includes("invalid-argument") ||
        code.includes("failed-precondition")
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  throw lastError;
}

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
  /** Explicit owner/profile reply â€” must match UI isOwnerViewing, not only uid==targetUid. */
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
  type?: "text" | "audio" | "image" | "video" | "profile";
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
  sharedProfile?: { uid: string; username: string; photo?: string; bio?: string };
  clientId?: string;
};

const canonicalMigrationStarted = new Set<string>();

export function resolvePersistAnonMessageType(
  type?: PersistAnonMessageInput["type"],
): NonNullable<PersistAnonMessageInput["type"]> {
  if (type === "audio" || type === "image" || type === "video" || type === "profile") return type;
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

/** Author id is never derived from late targetUid. Owner â†’ profile_{currentUid}. */
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

  // Canonical visitor from chatId first â€” required for profileâ†’anon unread.
  addAnon(chatIdAnon);
  // Visitor thread identity only â€” never the profile owner's live browser anon
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
  // Prefer live Firebase Auth uid so Storage upload + Firestore + commitViewOnce
  // share the same principal (avoids empty React uid â†’ commit author/member deny).
  const persistAuthUid = livePersistAuthUid(currentUid);

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
    currentUid: persistAuthUid,
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

  if (isOwnerReply && resolvedTargetUid) {
    const threadAnon =
      (isProfileAnonChatId(canonicalChatId) &&
      parseProfileAnonChatId(canonicalChatId).senderId.startsWith("anon_")
        ? parseProfileAnonChatId(canonicalChatId).senderId
        : "") ||
      String(existingData.anonSessionId || "").trim();
    if (threadAnon.startsWith("anon_")) {
      const { isProfileBlockedByAnon } = await import("@/lib/abuse/anonProfileBlocks");
      const blocked = await isProfileBlockedByAnon({
        anonSessionId: threadAnon,
        profileUid: resolvedTargetUid,
        chatId: canonicalChatId,
      });
      if (blocked) {
        throw Object.assign(new Error("blocked_by_anon"), { code: "blocked_by_anon" });
      }
    }
  }

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
  const isProfileAnonThread = isProfileAnonChatId(canonicalChatId);
  const participantes = isProfileAnonThread
    ? Array.from(
        new Set(
          [
            ...existingParticipantes.filter(
              (entry) =>
                entry.startsWith("anon_") ||
                (resolvedTargetUid !== "" && entry === resolvedTargetUid),
            ),
            ...(senderAnon ? [senderAnon] : []),
            ...(resolvedTargetUid ? [resolvedTargetUid] : []),
            ...(chatIdAnon ? [chatIdAnon] : []),
          ].filter(Boolean),
        ),
      )
    : Array.from(
        new Set([
          ...existingParticipantes,
          ...(senderAnon ? [senderAnon] : isOwnerReply ? [] : [senderId]),
          ...(persistAuthUid ? [persistAuthUid] : []),
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
  // Never publish visitor Firebase uid on chat docs readable by the receptor.
  const initiatorUid = existingInitiatorUid || null;

  const legacyIds = [
    ...buildLegacyProfileChatIds(senderId, username, resolvedTargetUid),
    ...(persistAuthUid
      ? buildLegacyProfileChatIds(persistAuthUid, username, resolvedTargetUid)
      : []),
    ...(chatId !== canonicalChatId ? [chatId] : []),
  ];
  let effectiveChatId = canonicalChatId;
  let abuseSendPermitId = "";
  let messageRef = doc(collection(db, "chats", effectiveChatId, "mensajes"));
  let writeChatRef = chatRef;
  let writeAnonSessionId = anonSessionId;
  let writeParticipantes = participantes;
  let writeMessageAuthorId = messageAuthorId;
  let writeSenderAnon = senderAnon;

  if (!isOwnerReply && isProfileAnonChatId(effectiveChatId) && resolvedTargetUid) {
    const { bindProfileAnonVisitorSession } = await import(
      "@/lib/abuse/bindProfileAnonVisitorSession"
    );
    try {
      const bound = await bindProfileAnonVisitorSession({
        receptorUid: resolvedTargetUid,
        chatId: effectiveChatId,
        username,
      });
      if (bound.chatId !== effectiveChatId) {
        effectiveChatId = bound.chatId;
        writeChatRef = doc(db, "chats", effectiveChatId);
        messageRef = doc(collection(db, "chats", effectiveChatId, "mensajes"));
        const nextAnon = parseProfileAnonChatId(effectiveChatId).senderId;
        writeAnonSessionId = nextAnon.startsWith("anon_") ? nextAnon : writeAnonSessionId;
        writeSenderAnon = writeAnonSessionId.startsWith("anon_") ? writeAnonSessionId : "";
        writeMessageAuthorId = writeSenderAnon || writeMessageAuthorId;
        writeParticipantes = Array.from(
          new Set(
            [writeAnonSessionId, resolvedTargetUid].filter(Boolean) as string[],
          ),
        );
      }
      const permit = await issueProfileAnonAbuseSendPermit({
        receptorUid: resolvedTargetUid,
        chatId: effectiveChatId,
        messageId: messageRef.id,
      });
      abuseSendPermitId = permit.permitId;
    } catch (error) {
      const blocked = Boolean((error as { blocked?: boolean })?.blocked);
      if (blocked) {
        throw Object.assign(new Error("abuse_blocked"), { code: "abuse_blocked", blocked: true });
      }
      throw error;
    }
  }

  const atomicBatch = buildProfileAnonAtomicSendBatch({
    messageText: storedText,
    lastMessage: lastMessagePreview,
    messageId: messageRef.id,
    senderAuthorId: writeMessageAuthorId,
    senderKind,
    senderRole: persistAuthor.senderRole,
    unreadRecipients,
    latestSenderAnonSessionId:
      senderKind === "anon" ? writeSenderAnon || writeAnonSessionId : "",
    senderIsAnonymous: !isOwnerReply,
    abuseSendPermitId: abuseSendPermitId || undefined,
    persistAuthUid: isOwnerReply ? persistAuthUid : undefined,
    senderAuthUid: isOwnerReply ? persistAuthor.senderAuthUid || persistAuthUid : undefined,
    senderProfileId: persistAuthor.senderProfileId || null,
    profileUid:
      isOwnerReply && persistAuthor.senderProfileId
        ? persistAuthor.senderProfileId
        : undefined,
  });

  const outgoingPatch = atomicBatch.chatWritePayload;

  const chatMeta = {
    id: effectiveChatId,
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
    anonSessionId: writeAnonSessionId,
    participantes: writeParticipantes,
    anon: true,
    senderIsAnonymous: !isOwnerReply,
    canonicalChatId: effectiveChatId,
    schemaVersion: 2,
    targetPhoto: targetPhoto || null,
    ...outgoingPatch,
  };

  const chatWritePayload =
    isProfileAnonChatId(effectiveChatId) && hasUsableChatData(existingData)
      ? buildProfileAnonChatWritePayload({
          senderAuthorId: writeMessageAuthorId,
          unreadRecipients,
          lastMessage: lastMessagePreview,
          latestMessageId: messageRef.id,
          latestSenderKind: senderKind,
          latestSenderAnonSessionId:
            senderKind === "anon" ? writeSenderAnon || writeAnonSessionId : "",
          senderIsAnonymous: !isOwnerReply,
          targetPhoto: targetPhoto || null,
        })
      : chatMeta;

  const storyReply = storyReplyPersist.storyReply;
  const storedReply = storyReplyPersist.storedReply;

  const messagePayload = {
    ...buildProfileAnonMessagePayload({
      messageText: storedText,
      senderAuthorId: writeMessageAuthorId,
      senderKind,
      senderRole: persistAuthor.senderRole,
      senderProfileId: persistAuthor.senderProfileId || null,
      abuseSendPermitId: abuseSendPermitId || undefined,
      persistAuthUid: isOwnerReply ? persistAuthUid : undefined,
      senderAuthUid: isOwnerReply ? persistAuthor.senderAuthUid || persistAuthUid : undefined,
      profileUid:
        isOwnerReply && persistAuthor.senderProfileId
          ? persistAuthor.senderProfileId
          : undefined,
      type,
    }),
    ...(storedReply ? { reply: storedReply } : {}),
    ...(storyReply ? { storyReply } : {}),
    type,
    // Bomb (viewOnce): never birth with client-readable mediaUrl â€” secret via commit.
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
    ...(input.sharedProfile ? { sharedProfile: input.sharedProfile } : {}),
    ...(input.clientId ? { clientId: input.clientId } : {}),
  };

  const writeStartedAt = Date.now();
  recordQaCriticalEvent("chat", "CHAT_MESSAGE_WRITE_START", {
    threadId: effectiveChatId,
    serverDocId: messageRef.id,
    clientId: input.clientId || "",
    senderKind,
    writeStartedAt,
  });

  async function commitPayload(payload: typeof messagePayload) {
    const batch = writeBatch(db);
    batch.set(writeChatRef, chatWritePayload, { merge: true });
    batch.set(messageRef, payload);
    try {
      await batch.commit();
    } catch (error) {
      throw new ChatMediaSendError(
        {
          stage: "persist",
          op: "writeBatch.commit",
          path: "chats/{chatId}+mensajes/{id}",
          code: firebaseErrorCode(error),
        },
        error,
      );
    }
  }

  try {
    await commitWithStoryReplyRulesFallback(messagePayload, commitPayload);
  } catch (error) {
    if (error instanceof ChatMediaSendError) throw error;
    throw new ChatMediaSendError(
      {
        stage: "persist",
        op: "commitWithStoryReplyRulesFallback",
        path: "chats/{chatId}+mensajes/{id}",
        code: firebaseErrorCode(error),
      },
      error,
    );
  }

  const writeAckAt = Date.now();
  recordQaCriticalEvent("chat", "CHAT_MESSAGE_PERSISTED", {
    threadId: chatId,
    canonicalThreadId: effectiveChatId,
    latestMessageId: messageRef.id,
    serverDocId: messageRef.id,
    clientId: input.clientId || "",
    senderKind,
    senderUid: writeMessageAuthorId,
    senderAuthUid: persistAuthor.senderAuthUid || persistAuthUid,
    senderRole: persistAuthor.senderRole,
    anonRecipientIds: unreadRecipients.filter((id) => id.startsWith("anon_")),
    unreadRecipientCount: unreadRecipients.length,
    writeStartedAt,
    writeAckAt,
    writeLatencyMs: writeAckAt - writeStartedAt,
  });

  if (viewOnce && mediaUrl) {
    try {
      await commitViewOnceSecretWithRetry({
        chatId: effectiveChatId,
        messageId: messageRef.id,
        mediaUrl,
      });
    } catch (error) {
      // Drop unsealed bomb doc so UI/listener never keep a ghost bubble.
      try {
        await deleteDoc(messageRef);
        await rollbackFailedViewOnceSummary({
          chatId: effectiveChatId,
          messageId: messageRef.id,
          previous: existingData,
        });
      } catch (rollbackError) {
        throw new ChatMediaSendError(
          {
            stage: "cleanup",
            op: "deleteDoc",
            path: "chats/{chatId}/mensajes/{id}",
            code: firebaseErrorCode(rollbackError),
          },
          error,
        );
      }
      throw new ChatMediaSendError(
        {
          stage: "secret",
          op: "commitViewOnceSecret",
          path: "callable:commitViewOnceSecret",
          code: firebaseErrorCode(error),
        },
        error,
      );
    }
  }

  // Register only after the chat summary/message (and any view-once secret)
  // are durably committed. Registering before the batch can make the Chats
  // inbox attach a listener to a still-missing document; that transient empty
  // snapshot was then removed from the session inbox, so a story reply could
  // appear sent but never show as a chat until a later reload.
  registerSessionChat(effectiveChatId);

  if (!isProfileAnonChatId(effectiveChatId)) {
    if (!canonicalMigrationStarted.has(effectiveChatId)) {
      canonicalMigrationStarted.add(effectiveChatId);
      void migrateToCanonicalChat(effectiveChatId, legacyIds, chatMeta).catch((error) => {
        canonicalMigrationStarted.delete(effectiveChatId);
        console.error("chat migrate", effectiveChatId, error);
      });
    }
  } else {
    // Profile-anon: never migrate across epochs (no authUid/old-anon merge).
    const sameEpochOnly = filterSameEpochLegacyIds(effectiveChatId, legacyIds);
    if (sameEpochOnly.length > 0 && !canonicalMigrationStarted.has(effectiveChatId)) {
      canonicalMigrationStarted.add(effectiveChatId);
      void migrateToCanonicalChat(effectiveChatId, sameEpochOnly, chatMeta).catch((error) => {
        canonicalMigrationStarted.delete(effectiveChatId);
        console.error("chat migrate", effectiveChatId, error);
      });
    }
  }

  scheduleModerationActivityTouch({
    id: effectiveChatId,
    targetUsername: username,
    receptorUsername: username,
    receptorUid: resolvedTargetUid || undefined,
    targetUid: resolvedTargetUid || undefined,
    initiatorUid: persistAuthUid || undefined,
    anonOwnerUid: resolvedTargetUid || undefined,
    anonSessionId: writeAnonSessionId,
    lastMessage: lastMessagePreview,
    lastMessageSender: writeMessageAuthorId,
    anon: true,
    senderIsAnonymous: !isOwnerReply,
  });

  return { messageId: messageRef.id, canonicalChatId: effectiveChatId };
}
