import { getChatAnonSenderId, getProfileChatAnonSenderId } from "@/lib/chat/anonSender";

export type ProfileAnonSenderKind = "anon" | "profile";

export type ProfileAnonViewerContext = {
  chatId: string;
  chatAnonSessionId: string;
  currentUid: string;
  targetUid: string;
  chatOwnerUid: string;
  profileUid: string;
  threadAnonId: string;
  isOwnerViewing: boolean;
};

export type ProfileAnonFirestoreMessage = {
  texto?: string;
  text?: string;
  fromUid?: string;
  ownerId?: string;
  senderUid?: string;
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

export function buildProfileAnonViewerContext(input: {
  chatId: string;
  chatAnonSessionId: string;
  currentUid: string;
  targetUid: string;
  chatOwnerUid: string;
}): ProfileAnonViewerContext {
  const profileUid = input.targetUid || input.chatOwnerUid;
  const isOwnerViewing = Boolean(
    input.currentUid && profileUid && input.currentUid === profileUid,
  );
  const threadAnonId = getProfileChatAnonSenderId(input.chatId, input.chatAnonSessionId);

  return {
    ...input,
    profileUid,
    threadAnonId,
    isOwnerViewing,
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

  if (senderKind === "profile" || senderKind === "anon") {
    return senderKind;
  }

  if (isProfileAuthorFrom({ from, profileUid, messageProfileUid })) {
    return "profile";
  }

  if (isProfileReplyAuthorId(from)) {
    return "profile";
  }

  if (from === threadAnonId || from.startsWith("anon_")) {
    return "anon";
  }

  return "unknown";
}

export function resolveProfileAnonMessageMine(input: {
  senderKind?: string;
  from: string;
  threadAnonId: string;
  profileUid: string;
  messageProfileUid?: string;
  isOwnerViewing: boolean;
  ownerUid?: string;
}) {
  const from = String(input.from || "").trim();
  const kind = resolveProfileAnonSenderKind({
    senderKind: input.senderKind,
    from,
    threadAnonId: input.threadAnonId,
    profileUid: input.profileUid,
    messageProfileUid: input.messageProfileUid,
  });

  if (input.isOwnerViewing) {
    if (kind === "profile") return true;
    if (input.ownerUid && from === input.ownerUid) return true;
    if (isProfileReplyAuthorId(from)) return true;
    return false;
  }

  if (kind === "profile") return false;

  const threadAnon = String(input.threadAnonId || "").trim();
  const liveAnon = getChatAnonSenderId();
  const visitorUid = String(input.ownerUid || "").trim();

  if (visitorUid && from === visitorUid) return true;
  if (threadAnon && from === threadAnon) return true;
  if (liveAnon.startsWith("anon_") && from === liveAnon) return true;

  return kind === "anon" && from.startsWith("anon_");
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
  const messageProfileUid = String(data.profileUid || "").trim() || undefined;
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
  T extends Pick<ProfileAnonUiMessage, "fromUid" | "senderKind" | "mine">,
>(messages: T[], ctx: ProfileAnonViewerContext): T[] {
  let changed = false;

  const next = messages.map((message) => {
    const from = String(message.fromUid || "");
    const mine = resolveProfileAnonMessageMine({
      senderKind: message.senderKind,
      from,
      threadAnonId: ctx.threadAnonId,
      profileUid: ctx.profileUid,
      isOwnerViewing: ctx.isOwnerViewing,
      ownerUid: ctx.currentUid,
    });

    if (mine === message.mine) return message;

    changed = true;
    return { ...message, mine };
  });

  return changed ? next : messages;
}
