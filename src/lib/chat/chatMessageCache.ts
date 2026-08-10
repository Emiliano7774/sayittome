import { auth } from "@/lib/firebase";

export type CachedChatMessage = {
  id: string;
  text: string;
  fromUid?: string;
  senderKind?: "anon" | "profile";
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
const STORAGE_PREFIX = "sayittome:chat-msgs:v2:";
const LEGACY_STORAGE_PREFIX = "sayittome:chat-msgs:v2:";
const MAX_CACHED = 50;

function resolveViewerKey(explicit?: string) {
  const trimmed = String(explicit || "").trim();
  if (trimmed) return trimmed;
  try {
    return auth.currentUser?.uid || "guest";
  } catch {
    return "guest";
  }
}

function scopedKey(chatId: string, viewerKey?: string) {
  return `${STORAGE_PREFIX}${resolveViewerKey(viewerKey)}:${chatId}`;
}

/** Legacy unscoped key used before uid namespacing. */
function legacyKey(chatId: string) {
  return `${LEGACY_STORAGE_PREFIX}${chatId}`;
}

function memoryGet(chatId: string, viewerKey?: string) {
  return memory.get(scopedKey(chatId, viewerKey)) || memory.get(legacyKey(chatId)) || null;
}

function memorySet(chatId: string, rows: CachedChatMessage[], viewerKey?: string) {
  const key = scopedKey(chatId, viewerKey);
  memory.set(key, rows);
  memory.delete(legacyKey(chatId));
}

export function readCachedChatMessages(
  chatId: string,
  viewerKey?: string,
): CachedChatMessage[] | null {
  if (!chatId) return null;

  const hit = memoryGet(chatId, viewerKey);
  if (hit?.length) return hit;

  if (typeof window === "undefined") return null;

  try {
    const scoped = window.sessionStorage.getItem(scopedKey(chatId, viewerKey));
    const legacy = scoped ? null : window.sessionStorage.getItem(legacyKey(chatId));
    const raw = scoped || legacy;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedChatMessage[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    memorySet(chatId, parsed, viewerKey);
    // Migrate legacy unscoped rows into the current viewer namespace once.
    if (!scoped && legacy) {
      try {
        window.sessionStorage.setItem(scopedKey(chatId, viewerKey), raw);
        window.sessionStorage.removeItem(legacyKey(chatId));
      } catch {
        // ignore quota
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedChatMessages(
  chatId: string,
  messages: CachedChatMessage[],
  viewerKey?: string,
) {
  if (!chatId || messages.length === 0) return;

  const trimmed = messages.slice(-MAX_CACHED);
  memorySet(chatId, trimmed, viewerKey);

  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(scopedKey(chatId, viewerKey), JSON.stringify(trimmed));
    window.sessionStorage.removeItem(legacyKey(chatId));
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
      if (key?.startsWith(STORAGE_PREFIX)) toRemove.push(key);
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
