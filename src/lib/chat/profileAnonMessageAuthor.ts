import { safeChatPart, usernameHintFromAnonChatId } from "@/lib/chat/anonChatId";
import { getChatAnonSenderId, getProfileChatAnonSenderId } from "@/lib/chat/anonSender";
import type { User } from "firebase/auth";

export type ProfileAnonSenderKind = "anon" | "profile";

export type ProfileAnonViewerContext = {
  chatId: string;
  chatAnonSessionId: string;
  currentUid: string;
  targetUid: string;
  chatOwnerUid: string;
  profileUid: string;
  viewerUsername?: string;
  threadAnonId: string;
  isOwnerViewing: boolean;
  identityReady?: boolean;
  senderAuthUid?: string;
  senderRole?: string;
};

export type ProfileAnonFirestoreMessage = {
  texto?: string;
  text?: string;
  fromUid?: string;
  ownerId?: string;
  senderUid?: string;
  senderAuthUid?: string;
  senderProfileId?: string;
  senderRole?: string;
  senderKind?: string;
  profileUid?: string;
  reply?: string;
  storyReply?: {
    storyId: string;
    mediaUrl?: string;
    mediaType?: string;
    ownerUsername?: string;
  };
  readBy?: Record<string, boolean>;
  type?: "text" | "audio" | "image" | "video";
  mediaUrl?: string;
  source?: "camera" | "gallery" | "audio";
  viewOnce?: boolean;
  clientId?: string;
  createdAt?: { toDate?: () => Date };
  autoModerationRequiresBlur?: boolean;
  moderationRequiresBlur?: boolean;
};

export type ProfileAnonUiMessage = {
  id: string;
  clientId?: string;
  text: string;
  mine: boolean;
  fromUid?: string;
  senderAuthUid?: string;
  senderRole?: string;
  senderKind?: ProfileAnonSenderKind;
  reply?: string;
  storyReply?: ProfileAnonFirestoreMessage["storyReply"];
  type?: ProfileAnonFirestoreMessage["type"];
  mediaUrl?: string;
  source?: ProfileAnonFirestoreMessage["source"];
  viewOnce?: boolean;
  autoModerationRequiresBlur?: boolean;
  moderationRequiresBlur?: boolean;
  readBy?: Record<string, boolean>;
  createdAt?: { toDate?: () => Date };
};

export function profileReplyAuthorId(targetUid: string) {
  const uid = String(targetUid || "").trim();
  return uid ? `profile_${uid}` : "profile_unknown";
}

export function isProfileReplyAuthorId(from: string) {
  return String(from || "").startsWith("profile_");
}

/** Profile Firebase uid only — never anonymous Auth uids (those invert owner/visitor). */
export function profileAuthUid(user: User | null | undefined) {
  if (!user || user.isAnonymous) return "";
  return String(user.uid || "").trim();
}

/**
 * Owner of a profile↔anon thread is the profile in the chatId slug
 * (`anon_*__anon_to__{username}`), not the visitor baked into the id.
 * Survives cold start before Firestore targetUid hydrates.
 */
export function isProfileThreadOwner(input: {
  chatId: string;
  authUid?: string;
  profileUid?: string;
  viewerUsername?: string;
}) {
  const authUid = String(input.authUid || "").trim();
  const profileUid = String(input.profileUid || "").trim();
  if (authUid && profileUid && authUid === profileUid) return true;

  const hint = usernameHintFromAnonChatId(input.chatId);
  const slug = safeChatPart(input.viewerUsername || "");
  return Boolean(hint && slug && hint === slug);
}

export function buildProfileAnonViewerContext(input: {
  chatId: string;
  chatAnonSessionId: string;
  currentUid: string;
  targetUid: string;
  chatOwnerUid: string;
  viewerUsername?: string;
  identityReady?: boolean;
}): ProfileAnonViewerContext {
  const profileUid = String(input.targetUid || input.chatOwnerUid || "").trim();
  const currentUid = String(input.currentUid || "").trim();
  const viewerUsername = String(input.viewerUsername || "").trim();
  const isOwnerViewing = isProfileThreadOwner({
    chatId: input.chatId,
    authUid: currentUid,
    profileUid,
    viewerUsername,
  });
  const threadAnonId = getProfileChatAnonSenderId(input.chatId, input.chatAnonSessionId);
  const identityReady =
    input.identityReady !== undefined
      ? input.identityReady
      : Boolean(currentUid || isOwnerViewing);

  return {
    ...input,
    currentUid,
    profileUid,
    viewerUsername,
    threadAnonId,
    isOwnerViewing,
    identityReady,
  };
}

function isProfileAuthorFrom(input: {
  from: string;
  profileUid: string;
  messageProfileUid?: string;
}) {
  const { from, profileUid, messageProfileUid } = input;
  const profileIds = new Set<string>();

  if (profileUid) {
    profileIds.add(profileUid);
    profileIds.add(profileReplyAuthorId(profileUid));
  }

  if (messageProfileUid) {
    profileIds.add(messageProfileUid);
    profileIds.add(profileReplyAuthorId(messageProfileUid));
  }

  return profileIds.has(from);
}

export function resolveProfileAnonSenderKind(input: {
  senderKind?: string;
  from: string;
  threadAnonId: string;
  profileUid: string;
  messageProfileUid?: string;
}): ProfileAnonSenderKind | "unknown" {
  const from = String(input.from || "").trim();
  const { senderKind, threadAnonId, profileUid, messageProfileUid } = input;

  if (!from) return "unknown";

  // fromUid shape wins over a contradictory senderKind (historical/mis-tagged docs).
  if (from.startsWith("anon_")) return "anon";
  if (isProfileReplyAuthorId(from)) return "profile";

  if (senderKind === "profile" || senderKind === "anon") {
    return senderKind;
  }

  if (isProfileAuthorFrom({ from, profileUid, messageProfileUid })) {
    return "profile";
  }

  if (from === threadAnonId) {
    return "anon";
  }

  return "unknown";
}

/**
 * Infer owner viewing from message authors when profileUid context is still empty
 * on cold reopen (avoids classifying own profile_* as peer and peer anon as mine).
 */
export function inferOwnerViewingFromAuthors(
  currentUid: string,
  profileUid: string,
  rows: Array<{ fromUid?: string }>,
) {
  const uid = String(currentUid || "").trim();
  const profile = String(profileUid || "").trim();
  if (uid && profile && uid === profile) return true;
  if (!uid) return false;
  const mineProfile = profileReplyAuthorId(uid);
  return rows.some((row) => {
    const from = String(row.fromUid || "").trim();
    return from === mineProfile || from === uid;
  });
}

/**
 * Durable mine classifier. Source of truth is fromUid shape + non-anonymous auth uid.
 * Never treats Firebase anonymous Auth uid as a profile owner.
 */
export function resolveProfileAnonMessageMine(input: {
  senderKind?: string;
  from: string;
  threadAnonId: string;
  profileUid: string;
  messageProfileUid?: string;
  isOwnerViewing: boolean;
  ownerUid?: string;
  senderAuthUid?: string;
  senderRole?: string;
  identityReady?: boolean;
}) {
  const from = String(input.from || "").trim();
  const authUid = String(input.ownerUid || "").trim();
  const senderAuthUid = String(input.senderAuthUid || "").trim();
  const senderRole = String(input.senderRole || "").trim();
  const profileUid = String(input.profileUid || "").trim();
  const messageProfileUid = String(input.messageProfileUid || "").trim();
  const kind = resolveProfileAnonSenderKind({
    senderKind: input.senderKind || senderRole,
    from,
    threadAnonId: input.threadAnonId,
    profileUid,
    messageProfileUid: messageProfileUid || undefined,
  });

  // Viewer ≠ author: durable senderAuthUid wins over late targetUid.
  if (authUid && senderAuthUid && senderAuthUid === authUid) return true;

  const identityReady =
    input.identityReady !== undefined
      ? input.identityReady
      : Boolean(authUid || input.isOwnerViewing === true);

  // Immutable senderRole from write-time identity. Do not fall through to
  // visitor-anon heuristics that invert historical/corrupt fromUid.
  if (senderRole === "profile" || senderRole === "anon") {
    if (senderRole === "profile") return input.isOwnerViewing === true;
    if (!identityReady) return false;
    if (input.isOwnerViewing) return false;
    return Boolean(input.threadAnonId && from === input.threadAnonId);
  }

  const ownsProfileShape =
    Boolean(authUid) &&
    (from === authUid ||
      from === profileReplyAuthorId(authUid) ||
      messageProfileUid === authUid);

  // Highest priority: this non-anonymous account authored the profile-shaped row.
  if (ownsProfileShape) return true;

  const ownerViewing = input.isOwnerViewing === true;

  if (ownerViewing) {
    return (
      senderRole === "profile" ||
      kind === "profile" ||
      isProfileReplyAuthorId(from) ||
      from === authUid
    );
  }

  // Peer profile replies are never mine for a visitor.
  if (senderRole === "profile" || kind === "profile" || isProfileReplyAuthorId(from)) {
    return false;
  }

  // Unknown viewer (auth/cache not ready): do not treat thread anon as mine.
  // That fallback is what inverts the owner after kill/reopen.
  if (!identityReady) return false;

  const threadAnon = String(input.threadAnonId || "").trim();
  const liveAnon = getChatAnonSenderId();

  // Visitor continuity: prefer chatId-baked thread anon (survives kill/reopen),
  // then live browser anon session.
  if (threadAnon && from === threadAnon) return true;
  if (liveAnon.startsWith("anon_") && from === liveAnon) return true;

  return false;
}

/** Profile↔profile / legacy threads: compare durable fromUid to viewer. */
export function resolveLegacyChatMessageMine(
  fromUid: string,
  viewerUid: string,
  senderAuthUid?: string,
) {
  const from = String(fromUid || "").trim();
  const viewer = String(viewerUid || "").trim();
  const senderAuth = String(senderAuthUid || "").trim();
  if (!viewer) return false;
  if (senderAuth && senderAuth === viewer) return true;
  if (!from) return false;
  if (from === viewer) return true;
  if (from === profileReplyAuthorId(viewer)) return true;
  return false;
}

export function firestoreMessageAuthorId(data: ProfileAnonFirestoreMessage) {
  return String(data.fromUid || data.ownerId || data.senderUid || "").trim();
}

export function resolveFirestoreMessageType(
  data: ProfileAnonFirestoreMessage & { mediaType?: string },
): ProfileAnonFirestoreMessage["type"] | undefined {
  const explicit = data.type;
  if (
    explicit === "text" ||
    explicit === "audio" ||
    explicit === "image" ||
    explicit === "video"
  ) {
    return explicit;
  }

  const legacy = String(data.mediaType || "").trim();
  if (legacy === "image" || legacy === "video" || legacy === "audio") {
    return legacy;
  }

  if (data.mediaUrl) {
    if (data.source === "audio") return "audio";
    const url = data.mediaUrl.toLowerCase();
    if (/\.(mp4|webm|mov|m4v)(\?|#|$)/.test(url)) return "video";
    if (/\.(mp3|wav|ogg|aac|m4a)(\?|#|$)/.test(url)) return "audio";
    return "image";
  }

  if (data.source === "audio") return "audio";
  if (data.source === "camera" || data.source === "gallery") {
    return "image";
  }

  return undefined;
}

export function mapFirestoreDocToProfileAnonMessage(
  docId: string,
  data: ProfileAnonFirestoreMessage,
  ctx: ProfileAnonViewerContext,
): ProfileAnonUiMessage | null {
  const text = String(data.texto || data.text || "").trim();
  const mediaUrl = String(data.mediaUrl || "");
  if (!text && !mediaUrl) return null;

  const from = firestoreMessageAuthorId(data);
  const messageProfileUid =
    String(data.profileUid || data.senderProfileId || "").trim() || undefined;
  const senderKind = resolveProfileAnonSenderKind({
    senderKind: data.senderKind,
    from,
    threadAnonId: ctx.threadAnonId,
    profileUid: ctx.profileUid,
    messageProfileUid,
  });
  const resolvedSenderKind =
    senderKind === "unknown" ? undefined : senderKind;
  const mine = resolveProfileAnonMessageMine({
    senderKind: data.senderKind,
    from,
    threadAnonId: ctx.threadAnonId,
    profileUid: ctx.profileUid,
    messageProfileUid,
    isOwnerViewing: ctx.isOwnerViewing,
    ownerUid: ctx.currentUid,
    senderAuthUid: data.senderAuthUid,
    senderRole: data.senderRole,
    identityReady: ctx.identityReady,
  });

  const resolvedType = resolveFirestoreMessageType(data);
  const displayText =
    resolvedType && resolvedType !== "text" ? "" : String(data.texto || data.text || "");

  return {
    id: docId,
    clientId: data.clientId ? String(data.clientId) : undefined,
    text: displayText,
    mine,
    fromUid: from || undefined,
    senderAuthUid: String(data.senderAuthUid || "").trim() || undefined,
    senderRole: String(data.senderRole || "").trim() || undefined,
    senderKind: resolvedSenderKind,
    reply: data.reply ? String(data.reply) : undefined,
    storyReply: data.storyReply,
    type: resolvedType,
    mediaUrl: mediaUrl || undefined,
    source: data.source,
    viewOnce: data.viewOnce === true,
    autoModerationRequiresBlur: data.autoModerationRequiresBlur === true,
    moderationRequiresBlur: data.moderationRequiresBlur === true,
    readBy: data.readBy || {},
    createdAt: data.createdAt,
  };
}

export function remapProfileAnonMessagesMine<
  T extends Pick<
    ProfileAnonUiMessage,
    "fromUid" | "senderKind" | "mine" | "senderAuthUid" | "senderRole"
  >,
>(messages: T[], ctx: ProfileAnonViewerContext): T[] {
  let changed = false;
  const isOwnerViewing =
    ctx.isOwnerViewing ||
    inferOwnerViewingFromAuthors(ctx.currentUid, ctx.profileUid, messages);

  const next = messages.map((message) => {
    const from = String(message.fromUid || "");
    const messageProfileUid = isProfileReplyAuthorId(from)
      ? from.slice("profile_".length)
      : undefined;
    const mine = resolveProfileAnonMessageMine({
      senderKind: message.senderKind,
      from,
      threadAnonId: ctx.threadAnonId,
      profileUid: ctx.profileUid,
      messageProfileUid,
      isOwnerViewing,
      ownerUid: ctx.currentUid,
      senderAuthUid: message.senderAuthUid,
      senderRole: message.senderRole,
      identityReady: ctx.identityReady,
    });

    if (mine === message.mine) return message;

    changed = true;
    return { ...message, mine };
  });

  return changed ? next : messages;
}

/** Map a Firestore snapshot with owner inference across the whole batch. */
export function mapFirestoreDocsToProfileAnonMessages(
  docs: Array<{ id: string; data: ProfileAnonFirestoreMessage }>,
  baseCtx: ProfileAnonViewerContext,
): ProfileAnonUiMessage[] {
  const authorRows = docs.map((doc) => ({
    fromUid: firestoreMessageAuthorId(doc.data),
  }));
  const ctx: ProfileAnonViewerContext = {
    ...baseCtx,
    isOwnerViewing:
      baseCtx.isOwnerViewing ||
      inferOwnerViewingFromAuthors(baseCtx.currentUid, baseCtx.profileUid, authorRows),
  };

  return docs
    .map((doc) => mapFirestoreDocToProfileAnonMessage(doc.id, doc.data, ctx))
    .filter((row): row is ProfileAnonUiMessage => row !== null);
}
