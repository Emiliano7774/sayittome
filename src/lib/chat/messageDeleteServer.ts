export const DELETED_MESSAGE_PREVIEW = "Mensaje eliminado";

export type ChatMessageDeleteMode = "me" | "everyone";

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

export function isCanonicalMessageAuthor(input: {
  uid: string;
  message: ChatMessageDeleteMessage;
  chat?: ChatMessageDeleteChat;
}) {
  const uid = asTrimmedId(input.uid);
  if (!uid) return false;
  const message = input.message;
  const from = messageAuthorId(message);
  const senderAuth = asTrimmedId(message.senderAuthUid || message.createdByAuthUid);
  if (senderAuth && senderAuth === uid) return true;
  if (from === uid) return true;
  if (from === `profile_${uid}`) return true;
  const profileFromMessage = asTrimmedId(message.profileUid || message.senderProfileId);
  if (profileFromMessage && profileFromMessage === uid && from.startsWith("profile_")) {
    return true;
  }
  const chat = input.chat;
  if (from.startsWith("anon_") && chat) {
    const session = asTrimmedId(chat.anonSessionId || chat.solicitanteAnonId);
    const initiator = asTrimmedId(chat.initiatorUid || chat.solicitanteUid);
    if (senderAuth === uid) return true;
    if (initiator === uid && (from === session || from === asTrimmedId(chat.solicitanteAnonId) || !session)) {
      return true;
    }
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
}) {
  const uid = asTrimmedId(input.uid);
  if (!uid) return false;
  if (isCanonicalMessageAuthor(input)) return true;

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
    if (!isChatMember({ uid, chat: input.chat, message: input.message })) {
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

  if (!isCanonicalMessageAuthor({ uid, message: input.message, chat: input.chat })) {
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
