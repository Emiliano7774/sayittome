export const DELETED_MESSAGE_PREVIEW = "Mensaje eliminado";

export type ProfileAnonPrivateAuthMessage = {
  fromUid?: string;
  ownerId?: string;
  senderUid?: string;
  senderAuthUid?: string;
  createdByAuthUid?: string;
  senderKind?: string;
  profileUid?: string;
  senderProfileId?: string;
};

export type ProfileAnonPrivateAuthChat = {
  anonSessionId?: string | null;
  solicitanteAnonId?: string | null;
  initiatorUid?: string | null;
  solicitanteUid?: string | null;
  targetUid?: string | null;
  receptorUid?: string | null;
  anonOwnerUid?: string | null;
};

export function messagePublicAuthorId(message: ProfileAnonPrivateAuthMessage) {
  return asTrimmedId(message.fromUid || message.ownerId || message.senderUid);
}

export function profileReplyAlias(uid: string) {
  const id = asTrimmedId(uid);
  if (!id || id.startsWith("anon_") || id.startsWith("profile_")) return id;
  return `profile_${id}`;
}

/** Owner-side author uid for verified links / scrub — uses private lease when anon has no public auth. */
export function resolveVerifiedProfileMessageAuthorUid(
  message: ProfileAnonPrivateAuthMessage,
  context?: {
    privateVisitorAuthUid?: string;
    chat?: ProfileAnonPrivateAuthChat | null;
  },
) {
  const senderAuth = asTrimmedId(message.senderAuthUid || message.createdByAuthUid);
  if (senderAuth) return senderAuth;

  const profileFrom = asTrimmedId(message.profileUid || message.senderProfileId);
  if (profileFrom) return profileFrom;

  const from = messagePublicAuthorId(message);
  const privateVisitor = asTrimmedId(context?.privateVisitorAuthUid);
  if (from.startsWith("anon_") && privateVisitor) {
    const session = anonSessionIdFromChat(context?.chat);
    if (!session || from === session) return privateVisitor;
  }

  return asTrimmedId(
    from || message.ownerId || message.senderUid,
  );
}

function anonSessionIdFromChat(chat: ProfileAnonPrivateAuthChat | null | undefined) {
  if (!chat) return "";
  return asTrimmedId(chat.anonSessionId || chat.solicitanteAnonId);
}

/** Firebase auth holder for anon messages without public senderAuthUid. */
export function isPrivateAnonVisitorAuthor(input: {
  uid: string;
  message: ProfileAnonPrivateAuthMessage;
  chat?: ProfileAnonPrivateAuthChat | null;
  privateVisitorAuthUid?: string;
}) {
  const uid = asTrimmedId(input.uid);
  const privateVisitorAuthUid = asTrimmedId(input.privateVisitorAuthUid);
  if (!uid || !privateVisitorAuthUid || uid !== privateVisitorAuthUid) return false;

  const from = messagePublicAuthorId(input.message);
  if (!from.startsWith("anon_")) return false;

  const session = anonSessionIdFromChat(input.chat);
  if (session && from === session) return true;

  const publicAuth = asTrimmedId(
    input.message.senderAuthUid || input.message.createdByAuthUid,
  );
  if (publicAuth && publicAuth === uid) return true;

  const initiator = asTrimmedId(input.chat?.initiatorUid || input.chat?.solicitanteUid);
  return initiator === uid && (!session || from === session);
}

/** Lease-bound visitor is a thread member even when not the message author (e.g. owner reply). */
export function isPrivateAnonLeaseMember(input: {
  uid: string;
  chat: ChatMessageDeleteChat;
  privateVisitorAuthUid?: string;
}) {
  const uid = asTrimmedId(input.uid);
  const bound = asTrimmedId(input.privateVisitorAuthUid);
  if (!uid || !bound || uid !== bound) return false;

  const session = anonSessionIdFromChat(input.chat);
  if (!session) return false;

  for (const list of [input.chat.participantes, input.chat.participants]) {
    for (const entry of list || []) {
      if (asTrimmedId(entry) === session) return true;
    }
  }
  return false;
}

export function isProfileOwnerMessageAuthor(input: {
  uid: string;
  message: ProfileAnonPrivateAuthMessage;
}) {
  const uid = asTrimmedId(input.uid);
  if (!uid) return false;
  const message = input.message;
  const senderAuth = asTrimmedId(message.senderAuthUid || message.createdByAuthUid);
  if (senderAuth && senderAuth === uid) return true;

  const from = messagePublicAuthorId(message);
  if (from === uid || from === profileReplyAlias(uid)) return true;

  const profileFromMessage = asTrimmedId(message.profileUid || message.senderProfileId);
  return Boolean(profileFromMessage && profileFromMessage === uid && from.startsWith("profile_"));
}

export type ChatMessageDeleteMode = "me" | "everyone";

export const CHAT_ROOT_COLLECTIONS = ["chats", "chats_anonimos"] as const;
export const MESSAGE_SUBCOLLECTIONS = ["mensajes", "messages"] as const;

export type ChatRootCollection = (typeof CHAT_ROOT_COLLECTIONS)[number];
export type MessageSubcollection = (typeof MESSAGE_SUBCOLLECTIONS)[number];

export type ResolvedChatMessageLocation = {
  chatRoot: ChatRootCollection;
  messageSubcollection: MessageSubcollection;
};

export type ChatMessageDeleteChat = {
  latestMessageId?: string;
  lastMessage?: string;
  lastMessageSender?: string;
  latestSenderKind?: string;
  ultimoMensaje?: string;
  participantes?: string[];
  participants?: string[];
  targetUid?: string | null;
  receptorUid?: string | null;
  anonOwnerUid?: string | null;
  initiatorUid?: string | null;
  anonSessionId?: string | null;
  solicitanteUid?: string | null;
  destinatarioUid?: string | null;
  solicitanteAnonId?: string | null;
  destinatarioAnonId?: string | null;
  anonId?: string | null;
  /** Firebase Auth uid bound at match accept (chats_anonimos). */
  solicitanteAuthUid?: string | null;
  destinatarioAuthUid?: string | null;
  /** chats_anonimos session: activo | cerrado | denunciado */
  estado?: string | null;
};

export type ChatMessageDeleteMessage = {
  fromUid?: string;
  ownerId?: string;
  senderUid?: string;
  senderId?: string;
  senderTipo?: string;
  senderAuthUid?: string;
  createdByAuthUid?: string;
  senderRole?: string;
  senderKind?: string;
  profileUid?: string;
  senderProfileId?: string;
  mediaUrl?: string;
  clientId?: string;
  hiddenFor?: Record<string, boolean>;
  deletedForEveryone?: boolean;
  type?: string;
  texto?: string;
  text?: string;
};

export function asTrimmedId(value: unknown) {
  return String(value || "").trim();
}

export function messageAuthorId(message: ChatMessageDeleteMessage) {
  return asTrimmedId(
    message.fromUid || message.ownerId || message.senderUid || message.senderId,
  );
}

export function pickUniqueChatMessageLocation(
  hits: ResolvedChatMessageLocation[],
): ResolvedChatMessageLocation | null {
  if (hits.length !== 1) return null;
  return hits[0];
}

export function isAllowedChatStoragePath(path: string) {
  const normalized = asTrimmedId(path);
  return (
    normalized.startsWith("chats/") || normalized.startsWith("chats_anonimos/")
  );
}

export function hideKeyForAuthUid(uid: string) {
  return asTrimmedId(uid);
}

export function viewerHideKeys(input: {
  authUid?: string;
  profileUid?: string;
  anonId?: string;
}) {
  const keys = new Set<string>();
  const authUid = asTrimmedId(input.authUid);
  const profileUid = asTrimmedId(input.profileUid);
  const anonId = asTrimmedId(input.anonId);
  if (authUid) {
    keys.add(authUid);
    keys.add(`uid:${authUid}`);
  }
  if (profileUid) keys.add(`uid:${profileUid}`);
  if (anonId.startsWith("anon_")) keys.add(`anon:${anonId}`);
  return [...keys];
}

export function isHiddenForAnyKey(
  hiddenFor: Record<string, boolean> | undefined,
  keys: string[],
) {
  if (!hiddenFor) return false;
  return keys.some((key) => hiddenFor[key] === true);
}

/**
 * chats_anonimos docs stamp Firebase Auth uids at accept time.
 * Presence of either Auth uid marks the doc as anon-match (not a normal chat).
 */
export function isAnonMatchChatDoc(chat: ChatMessageDeleteChat | null | undefined) {
  if (!chat) return false;
  return Boolean(
    asTrimmedId(chat.solicitanteAuthUid) || asTrimmedId(chat.destinatarioAuthUid),
  );
}

export function isActiveAnonMatchSession(chat: ChatMessageDeleteChat | null | undefined) {
  return asTrimmedId(chat?.estado) === "activo";
}

/** Auth uid is one of the two bound identities on an active anon-match session. */
export function isActiveAnonMatchAuthMember(input: {
  uid: string;
  chat: ChatMessageDeleteChat;
}) {
  const uid = asTrimmedId(input.uid);
  if (!uid || !isAnonMatchChatDoc(input.chat) || !isActiveAnonMatchSession(input.chat)) {
    return false;
  }
  const solicitanteAuthUid = asTrimmedId(input.chat.solicitanteAuthUid);
  const destinatarioAuthUid = asTrimmedId(input.chat.destinatarioAuthUid);
  return (
    (Boolean(solicitanteAuthUid) && uid === solicitanteAuthUid) ||
    (Boolean(destinatarioAuthUid) && uid === destinatarioAuthUid)
  );
}

/**
 * Reliable author binding for anon-match: Firebase Auth uid ↔ anon_* alias
 * (or direct Auth uid as senderId for profile-side participants).
 * Closed / expired / missing estado → not author (no forge via alias alone).
 */
export function isAnonMatchBoundMessageAuthor(input: {
  uid: string;
  message: ChatMessageDeleteMessage | ProfileAnonPrivateAuthMessage;
  chat?: ChatMessageDeleteChat | null;
}) {
  const uid = asTrimmedId(input.uid);
  const chat = input.chat;
  if (!uid || !chat || !isActiveAnonMatchAuthMember({ uid, chat })) return false;

  const from = messageAuthorId(input.message as ChatMessageDeleteMessage);
  if (!from) return false;
  if (from === uid || from === `profile_${uid}`) return true;

  const solicitanteAuthUid = asTrimmedId(chat.solicitanteAuthUid);
  const destinatarioAuthUid = asTrimmedId(chat.destinatarioAuthUid);
  const solicitanteAnonId = asTrimmedId(chat.solicitanteAnonId);
  const destinatarioAnonId = asTrimmedId(chat.destinatarioAnonId || chat.anonId);

  if (
    uid === solicitanteAuthUid &&
    solicitanteAnonId &&
    from === solicitanteAnonId
  ) {
    return true;
  }
  if (
    uid === destinatarioAuthUid &&
    destinatarioAnonId &&
    from === destinatarioAnonId
  ) {
    return true;
  }
  return false;
}

export function isCanonicalMessageAuthor(input: {
  uid: string;
  message: ChatMessageDeleteMessage;
  chat?: ChatMessageDeleteChat;
  privateVisitorAuthUid?: string;
}) {
  const uid = asTrimmedId(input.uid);
  if (!uid) return false;
  const message = input.message;
  const from = messageAuthorId(message);
  if (isProfileOwnerMessageAuthor({ uid, message })) return true;
  if (from === uid) return true;
  if (from === `profile_${uid}`) return true;

  const chat = input.chat;
  if (
    isPrivateAnonVisitorAuthor({
      uid,
      message,
      chat,
      privateVisitorAuthUid: input.privateVisitorAuthUid,
    })
  ) {
    return true;
  }

  if (isAnonMatchBoundMessageAuthor({ uid, message, chat })) {
    return true;
  }

  if (from.startsWith("anon_") && chat && !isAnonMatchChatDoc(chat)) {
    const destAnon = asTrimmedId(chat.destinatarioAnonId || chat.anonId);
    const destUid = asTrimmedId(chat.destinatarioUid);
    if (destUid === uid && destAnon && from === destAnon) return true;
  }
  return false;
}

export function isChatMember(input: {
  uid: string;
  chat: ChatMessageDeleteChat;
  message: ChatMessageDeleteMessage;
  privateVisitorAuthUid?: string;
}) {
  const uid = asTrimmedId(input.uid);
  if (!uid) return false;

  // Anon-match: never trust anon_* / participantes alone. Auth uid must match
  // solicitanteAuthUid|destinatarioAuthUid on an active session.
  if (isAnonMatchChatDoc(input.chat)) {
    return isActiveAnonMatchAuthMember({ uid, chat: input.chat });
  }

  if (isCanonicalMessageAuthor(input)) return true;
  if (isPrivateAnonLeaseMember(input)) return true;

  const ids = new Set<string>();
  for (const list of [input.chat.participantes, input.chat.participants]) {
    for (const entry of list || []) {
      const id = asTrimmedId(entry);
      if (id) ids.add(id);
    }
  }
  for (const key of [
    input.chat.targetUid,
    input.chat.receptorUid,
    input.chat.anonOwnerUid,
    input.chat.initiatorUid,
    input.chat.solicitanteUid,
    input.chat.destinatarioUid,
    input.chat.solicitanteAnonId,
    input.chat.destinatarioAnonId,
    input.chat.anonId,
  ]) {
    const id = asTrimmedId(key);
    if (id) ids.add(id);
  }
  return ids.has(uid) || ids.has(`profile_${uid}`);
}

export const QUIET_DELETE_SUMMARY_FORBIDDEN_KEYS = [
  "lastMessageAt",
  "updatedAt",
  "unreadCounts",
  "readBy",
  "typing",
] as const;

export function isQuietEveryoneDeleteSummary(
  patch: Record<string, unknown> | null | undefined,
) {
  if (!patch) return true;
  return QUIET_DELETE_SUMMARY_FORBIDDEN_KEYS.every((key) => !(key in patch));
}

export function isLatestChatMessage(input: {
  chat: ChatMessageDeleteChat;
  messageId: string;
}) {
  const latest = asTrimmedId(input.chat.latestMessageId);
  const messageId = asTrimmedId(input.messageId);
  return Boolean(latest) && latest === messageId;
}

export function storagePathFromDownloadUrl(url: string) {
  const raw = String(url || "");
  const encoded = /\/o\/([^?]+)/.exec(raw)?.[1] || "";
  if (!encoded) return "";
  try {
    const path = decodeURIComponent(encoded);
    return isAllowedChatStoragePath(path) ? path : "";
  } catch {
    return "";
  }
}

export function classifyStorageDeleteResult(error: unknown) {
  if (!error) return "ok" as const;
  const code = String((error as { code?: string } | null)?.code || "").toLowerCase();
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  if (code.includes("object-not-found") || message.includes("not found") || code.includes("404")) {
    return "missing" as const;
  }
  if (code.includes("unauthorized") || message.includes("unauthorized")) {
    return "unauthorized" as const;
  }
  return "failed" as const;
}

export function tombstonePublicFields() {
  return {
    deletedForEveryone: true,
    texto: DELETED_MESSAGE_PREVIEW,
    text: DELETED_MESSAGE_PREVIEW,
    mediaUrl: "",
    type: "text",
    source: "",
  };
}

export function chatSummaryAfterEveryoneDelete(input: {
  chat: ChatMessageDeleteChat;
  messageId: string;
  message: ChatMessageDeleteMessage;
}) {
  if (!isLatestChatMessage(input)) return null;
  return {
    lastMessage: DELETED_MESSAGE_PREVIEW,
    lastMessageSender: messageAuthorId(input.message) || asTrimmedId(input.chat.lastMessageSender),
    latestMessageId: asTrimmedId(input.messageId),
    latestSenderKind: asTrimmedId(input.message.senderKind || input.chat.latestSenderKind),
  };
}

export type ChatMessageDeleteDecision =
  | { ok: true; mode: "me"; alreadyApplied: boolean; hideKey: string }
  | {
      ok: true;
      mode: "everyone";
      alreadyApplied: boolean;
      storagePath: string;
      summary: ReturnType<typeof chatSummaryAfterEveryoneDelete>;
    }
  | { ok: false; error: "unauthenticated" | "invalid-argument" | "not-found" | "permission-denied" };

export function decideChatMessageDelete(input: {
  uid?: string;
  mode?: string;
  chatId?: string;
  messageId?: string;
  chat?: ChatMessageDeleteChat | null;
  message?: ChatMessageDeleteMessage | null;
  privateVisitorAuthUid?: string;
}): ChatMessageDeleteDecision {
  const uid = asTrimmedId(input.uid);
  if (!uid) return { ok: false, error: "unauthenticated" };
  const mode = String(input.mode || "").trim();
  const chatId = asTrimmedId(input.chatId);
  const messageId = asTrimmedId(input.messageId);
  if ((mode !== "me" && mode !== "everyone") || !chatId || !messageId) {
    return { ok: false, error: "invalid-argument" };
  }
  if (!input.chat || !input.message) return { ok: false, error: "not-found" };

  if (mode === "me") {
    if (
      !isChatMember({
        uid,
        chat: input.chat,
        message: input.message,
        privateVisitorAuthUid: input.privateVisitorAuthUid,
      })
    ) {
      return { ok: false, error: "permission-denied" };
    }
    const hideKey = hideKeyForAuthUid(uid);
    return {
      ok: true,
      mode: "me",
      alreadyApplied: input.message.hiddenFor?.[hideKey] === true,
      hideKey,
    };
  }

  if (
    !isCanonicalMessageAuthor({
      uid,
      message: input.message,
      chat: input.chat,
      privateVisitorAuthUid: input.privateVisitorAuthUid,
    })
  ) {
    return { ok: false, error: "permission-denied" };
  }

  return {
    ok: true,
    mode: "everyone",
    alreadyApplied: input.message.deletedForEveryone === true,
    storagePath: storagePathFromDownloadUrl(String(input.message.mediaUrl || "")),
    summary: chatSummaryAfterEveryoneDelete({
      chat: input.chat,
      messageId,
      message: input.message,
    }),
  };
}
