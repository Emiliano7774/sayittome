export type CachedChatMessage = {
  id: string;
  text: string;
  fromUid?: string;
  senderKind?: "anon" | "profile";
  /** Last known side for warm paint before auth settles; always recomputed after. */
  mine?: boolean;
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
/** chatId-only keys. `mine` is always recomputed from auth; uid-scoping caused warm misses. */
const STORAGE_PREFIX = "sayittome:chat-msgs:v3:";
const LEGACY_PREFIXES = ["sayittome:chat-msgs:v2:", "sayittome:chat-msgs:v3:"] as const;
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
    const primary = window.sessionStorage.getItem(storageKey(chatId));
    let raw = primary;
    if (!raw) {
      // Fall back to any v2 scoped/unscoped key for this chatId (guest:uid race leftovers).
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (!key?.startsWith("sayittome:chat-msgs:v2:")) continue;
        if (key === `sayittome:chat-msgs:v2:${chatId}` || key.endsWith(`:${chatId}`)) {
          raw = window.sessionStorage.getItem(key);
          if (raw) break;
        }
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedChatMessage[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    memory.set(chatId, parsed);
    try {
      window.sessionStorage.setItem(storageKey(chatId), JSON.stringify(parsed));
    } catch {
      // ignore quota
    }
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

/** Purge all private chat message caches (memory + session). Call on logout. */
export function clearCachedChatMessages() {
  memory.clear();
  if (typeof window === "undefined") return;

  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key) continue;
      if (LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
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
  fromUid?: string;
  senderKind?: "anon" | "profile";
  mine?: boolean;
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
    fromUid: message.fromUid,
    senderKind: message.senderKind,
    mine: message.mine,
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
