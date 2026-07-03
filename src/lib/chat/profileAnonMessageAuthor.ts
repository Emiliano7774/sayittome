import { getProfileChatAnonSenderId } from "@/lib/chat/anonSender";

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
  createdAt?: { toDate?: () => Date };
  autoModerationRequiresBlur?: boolean;
  moderationRequiresBlur?: boolean;
};

export type ProfileAnonUiMessage = {
  id: string;
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
  const kind = resolveProfileAnonSenderKind({
    senderKind: input.senderKind,
    from: input.from,
    threadAnonId: input.threadAnonId,
    profileUid: input.profileUid,
    messageProfileUid: input.messageProfileUid,
  });

  if (kind === "unknown") {
    return false;
  }

  if (input.isOwnerViewing) {
    return kind === "profile";
  }

  return kind === "anon";
}

export function firestoreMessageAuthorId(data: ProfileAnonFirestoreMessage) {
  return String(data.fromUid || data.ownerId || data.senderUid || "").trim();
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

  return {
    id: docId,
    text: String(data.texto || data.text || ""),
    mine,
    fromUid: from || undefined,
    senderKind: resolvedSenderKind,
    reply: data.reply ? String(data.reply) : undefined,
    storyReply: data.storyReply,
    type: data.type,
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
