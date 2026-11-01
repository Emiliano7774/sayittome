import { readAttestationHint } from "@/lib/chat/officialProfileLinkMessage";
import { resolveFirestoreMessageType } from "@/lib/chat/profileAnonMessageAuthor";

export type CachedChatMessage = {
  id: string;
  text: string;
  fromUid?: string;
  senderAuthUid?: string;
  senderProfileId?: string;
  senderRole?: string;
  senderKind?: "anon" | "profile";
  /**
   * Last known side for warm paint before auth settles; always recomputed
   * after. Only written once role identity settled, so a cold-open guess can
   * never become the durable side of a bubble.
   */
  mine?: boolean;
  reply?: string;
  storyReply?: {
    storyId: string;
    mediaUrl?: string;
    mediaType?: string;
    ownerUsername?: string;
    text?: string;
  };
  type?: "text" | "audio" | "image" | "video";
  mediaUrl?: string;
  source?: "camera" | "gallery" | "audio";
  viewOnce?: boolean;
  autoModerationRequiresBlur?: boolean;
  moderationRequiresBlur?: boolean;
  readBy?: Record<string, boolean>;
  createdAtMs?: number;
  hiddenFor?: Record<string, boolean>;
  deletedForEveryone?: boolean;
  /** Untrusted ticket id hint only. Never a verified badge grant. */
  verifiedProfileAttestation?: { ticketId: string };
};

const memory = new Map<string, CachedChatMessage[]>();
/** chatId-only keys. `mine` is always recomputed from auth; uid-scoping caused warm misses. */
const STORAGE_PREFIX = "sayittome:chat-msgs:v3:";
const LEGACY_PREFIXES = ["sayittome:chat-msgs:v2:", "sayittome:chat-msgs:v3:"] as const;
/** Keep more than one live page so warm reopen retains paginated history. */
const MAX_CACHED = 200;

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
    // Migrate a legacy entry only; rewriting an existing v3 entry on cold
    // read synchronously blocks the first visible chat frame for no benefit.
    if (!primary) {
      try {
        window.sessionStorage.setItem(storageKey(chatId), JSON.stringify(parsed));
      } catch {
        // ignore quota
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Coalesce sessionStorage JSON writes so snapshot→paint is not blocked. */
const pendingSessionPersist = new Map<string, CachedChatMessage[]>();
let sessionPersistScheduled = false;

function flushPendingSessionPersist() {
  sessionPersistScheduled = false;
  if (typeof window === "undefined") return;
  const entries = Array.from(pendingSessionPersist.entries());
  pendingSessionPersist.clear();
  for (const [chatId, trimmed] of entries) {
    // Prefer the latest in-memory row if a newer write landed.
    const latest = memory.get(chatId) || trimmed;
    try {
      window.sessionStorage.setItem(storageKey(chatId), JSON.stringify(latest));
    } catch {
      // sessionStorage full or unavailable
    }
  }
}

function scheduleSessionPersist(chatId: string, trimmed: CachedChatMessage[]) {
  if (typeof window === "undefined") return;
  pendingSessionPersist.set(chatId, trimmed);
  if (sessionPersistScheduled) return;
  sessionPersistScheduled = true;
  const run = () => flushPendingSessionPersist();
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 120 });
  } else {
    // On browsers without requestIdleCallback, a microtask would run before
    // the next paint and recreate the very input/paint stall we avoid.
    window.setTimeout(run, 32);
  }
}

export function writeCachedChatMessages(chatId: string, messages: CachedChatMessage[]) {
  if (!chatId || messages.length === 0) return;

  const trimmed = messages.slice(-MAX_CACHED);
  // Memory stays sync so reopen/warm reads see fresh rows immediately.
  memory.set(chatId, trimmed);

  if (typeof window === "undefined") return;

  // Defer JSON.stringify + sessionStorage off the listener→paint path.
  scheduleSessionPersist(chatId, trimmed);
}

/** Remove one thread's cached bubbles so a deleted chat cannot reopen with history. */
export function removeCachedChatMessages(chatId: string) {
  const id = String(chatId || "").trim();
  if (!id) return;
  memory.delete(id);
  pendingSessionPersist.delete(id);
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(storageKey(id));
    const toRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key) continue;
      if (key === `sayittome:chat-msgs:v2:${id}` || key.endsWith(`:${id}`)) {
        if (LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          toRemove.push(key);
        }
      }
    }
    for (const key of toRemove) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}
export function clearCachedChatMessages() {
  memory.clear();
  pendingSessionPersist.clear();
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
    type: resolveFirestoreMessageType(message),
    createdAt: message.createdAtMs
      ? { toDate: () => new Date(message.createdAtMs!) }
      : undefined,
  };
}

export function uiMessageToCached(message: {
  id: string;
  text: string;
  fromUid?: string;
  senderAuthUid?: string;
  senderProfileId?: string;
  senderRole?: string;
  senderKind?: "anon" | "profile";
  mine?: boolean;
  mineResolved?: boolean;
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
  hiddenFor?: Record<string, boolean>;
  deletedForEveryone?: boolean;
  verifiedProfileAttestation?: unknown;
}): CachedChatMessage {
  const createdAtMs = message.createdAt?.toDate?.()?.getTime();
  return {
    id: message.id,
    text: message.text,
    fromUid: message.fromUid,
    senderAuthUid: message.senderAuthUid,
    senderProfileId: message.senderProfileId,
    senderRole: message.senderRole,
    senderKind: message.senderKind,
    mine: message.mineResolved === false ? undefined : message.mine,
    reply: message.reply,
    storyReply: message.storyReply,
    type: resolveFirestoreMessageType(message),
    mediaUrl: message.mediaUrl,
    source: message.source,
    viewOnce: message.viewOnce,
    autoModerationRequiresBlur: message.autoModerationRequiresBlur,
    moderationRequiresBlur: message.moderationRequiresBlur,
    readBy: message.readBy,
    hiddenFor: message.hiddenFor,
    deletedForEveryone: message.deletedForEveryone,
    ...(createdAtMs ? { createdAtMs } : {}),
    ...(readAttestationHint(message.verifiedProfileAttestation)
      ? { verifiedProfileAttestation: readAttestationHint(message.verifiedProfileAttestation)! }
      : {}),
  };
}
