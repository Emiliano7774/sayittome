export type CachedChatMessage = {
  id: string;
  text: string;
  mine: boolean;
  fromUid?: string;
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
  readBy?: Record<string, boolean>;
  createdAtMs?: number;
};

const memory = new Map<string, CachedChatMessage[]>();
const STORAGE_PREFIX = "sayittome:chat-msgs:";
const MAX_CACHED = 50;

function storageKey(chatId: string) {
  return `${STORAGE_PREFIX}${chatId}`;
}

export function readCachedChatMessages(chatId: string): CachedChatMessage[] | null {
  if (!chatId) return null;

  const hit = memory.get(chatId);
  if (hit?.length) return hit;

  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedChatMessage[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    memory.set(chatId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedChatMessages(chatId: string, messages: CachedChatMessage[]) {
  if (!chatId || messages.length === 0) return;

  const trimmed = messages.slice(-MAX_CACHED);
  memory.set(chatId, trimmed);

  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(storageKey(chatId), JSON.stringify(trimmed));
  } catch {
    // sessionStorage full or unavailable
  }
}

export function cachedMessageToUi(message: CachedChatMessage) {
  return {
    ...message,
    createdAt: message.createdAtMs
      ? { toDate: () => new Date(message.createdAtMs!) }
      : undefined,
  };
}

export function uiMessageToCached(message: {
  id: string;
  text: string;
  mine: boolean;
  fromUid?: string;
  reply?: string;
  storyReply?: CachedChatMessage["storyReply"];
  type?: CachedChatMessage["type"];
  mediaUrl?: string;
  source?: CachedChatMessage["source"];
  viewOnce?: boolean;
  autoModerationRequiresBlur?: boolean;
  moderationRequiresBlur?: boolean;
  readBy?: Record<string, boolean>;
  createdAt?: { toDate?: () => Date };
}): CachedChatMessage {
  const createdAtMs = message.createdAt?.toDate?.()?.getTime();
  return {
    id: message.id,
    text: message.text,
    mine: message.mine,
    fromUid: message.fromUid,
    reply: message.reply,
    storyReply: message.storyReply,
    type: message.type,
    mediaUrl: message.mediaUrl,
    source: message.source,
    viewOnce: message.viewOnce,
    autoModerationRequiresBlur: message.autoModerationRequiresBlur,
    moderationRequiresBlur: message.moderationRequiresBlur,
    readBy: message.readBy,
    ...(createdAtMs ? { createdAtMs } : {}),
  };
}
