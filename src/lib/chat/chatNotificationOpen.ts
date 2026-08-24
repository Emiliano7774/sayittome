/**
 * Notification / FCM / deep-link chat open: seed + target + scroll-before-reveal.
 * Survives remount via sessionStorage; never paints an empty intermediate thread.
 */
import {
  readCachedChatMessages,
  writeCachedChatMessages,
  type CachedChatMessage,
} from "@/lib/chat/chatMessageCache";

export const CHAT_NOTIF_OPEN_KEY = "sayittome:chat-notif-open:v1";

export type ChatNotificationOpenPayload = {
  chatId: string;
  messageId?: string;
  body?: string;
  title?: string;
  fromUid?: string;
};

export type ChatNotificationOpenMark = ChatNotificationOpenPayload & {
  markedAt: number;
};

function asId(value: unknown) {
  return String(value || "").trim();
}

export function buildChatNotificationOpenHref(input: {
  chatId: string;
  messageId?: string;
  username?: string;
}) {
  const chatId = asId(input.chatId);
  if (!chatId) return "";
  const params = new URLSearchParams({ from: "push" });
  const messageId = asId(input.messageId);
  if (messageId) params.set("mid", messageId);
  const username = asId(input.username);
  if (username) params.set("u", username);
  return `/chat/${encodeURIComponent(chatId)}?${params.toString()}`;
}

export function resolvePushChatOpenPlan(input: {
  chatId: string;
  authed: boolean;
  messageId?: string;
  username?: string;
}): { kind: "ignore" } | { kind: "queue"; chatId: string } | { kind: "open"; href: string } {
  const chatId = asId(input.chatId);
  if (!chatId) return { kind: "ignore" };
  if (!input.authed) return { kind: "queue", chatId };
  return {
    kind: "open",
    href: buildChatNotificationOpenHref({
      chatId,
      messageId: input.messageId,
      username: input.username,
    }),
  };
}

export function seedCachedChatFromNotificationPayload(
  input: ChatNotificationOpenPayload,
): CachedChatMessage | null {
  const chatId = asId(input.chatId);
  const messageId = asId(input.messageId) || `push_${Date.now()}`;
  if (!chatId) return null;

  const text = asId(input.body) || asId(input.title) || "Nuevo mensaje";
  const seed: CachedChatMessage = {
    id: messageId,
    text,
    fromUid: asId(input.fromUid) || undefined,
    mine: false,
    createdAtMs: Date.now(),
    readBy: {},
  };

  const existing = readCachedChatMessages(chatId) || [];
  const withoutDup = existing.filter((row) => asId(row.id) !== messageId);
  writeCachedChatMessages(chatId, [...withoutDup, seed]);
  return seed;
}

export function markChatOpenedFromNotification(
  input: ChatNotificationOpenPayload,
): ChatNotificationOpenMark | null {
  const chatId = asId(input.chatId);
  if (!chatId || typeof window === "undefined") return null;

  const existing = readCachedChatMessages(chatId);
  if (!existing?.length) {
    seedCachedChatFromNotificationPayload(input);
  } else if (asId(input.messageId)) {
    // Ensure the notified message is present even on warm cache.
    const mid = asId(input.messageId);
    if (!existing.some((row) => asId(row.id) === mid)) {
      seedCachedChatFromNotificationPayload(input);
    }
  }

  const mark: ChatNotificationOpenMark = {
    chatId,
    messageId: asId(input.messageId) || undefined,
    body: asId(input.body) || undefined,
    title: asId(input.title) || undefined,
    fromUid: asId(input.fromUid) || undefined,
    markedAt: Date.now(),
  };
  try {
    window.sessionStorage.setItem(CHAT_NOTIF_OPEN_KEY, JSON.stringify(mark));
  } catch {
    /* quota */
  }
  return mark;
}

export function peekChatNotificationOpen(): ChatNotificationOpenMark | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CHAT_NOTIF_OPEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatNotificationOpenMark;
    if (!parsed || typeof parsed !== "object") return null;
    const chatId = asId(parsed.chatId);
    if (!chatId) return null;
    return {
      chatId,
      messageId: asId(parsed.messageId) || undefined,
      body: asId(parsed.body) || undefined,
      title: asId(parsed.title) || undefined,
      fromUid: asId(parsed.fromUid) || undefined,
      markedAt: Number(parsed.markedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function consumeChatNotificationOpen(chatId: string): ChatNotificationOpenMark | null {
  const peek = peekChatNotificationOpen();
  if (!peek || peek.chatId !== asId(chatId)) return null;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(CHAT_NOTIF_OPEN_KEY);
    } catch {
      /* ignore */
    }
  }
  return peek;
}

export function isChatOpenedFromNotification(
  chatId: string,
  searchParams?: { get?: (key: string) => string | null } | null,
) {
  const fromQuery = asId(searchParams?.get?.("from")) === "push";
  const peek = peekChatNotificationOpen();
  return fromQuery || (Boolean(peek) && peek!.chatId === asId(chatId));
}

export function shouldHoldChatRevealUntilScrollBottom(input: {
  fromNotification: boolean;
  messageCount: number;
}) {
  return input.fromNotification && input.messageCount > 0;
}

export function isChatScrollAtBottom(
  node: Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight"> | null | undefined,
  tolerance = 3,
) {
  if (!node) return false;
  const max = Math.max(0, node.scrollHeight - node.clientHeight);
  return max - Number(node.scrollTop || 0) <= tolerance;
}

/** Sync scroll to exact bottom. Returns true when already at bottom after apply. */
export function applyChatScrollBottomExact(
  node: Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight"> | null | undefined,
) {
  if (!node) return false;
  node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
  return isChatScrollAtBottom(node);
}

export function shouldAutoscrollChatNotificationOpen(input: {
  fromNotification: boolean;
  stickToBottom: boolean;
  showIntro: boolean;
}) {
  if (input.fromNotification) return input.stickToBottom;
  return input.stickToBottom && !input.showIntro;
}

/** Merge live rows into seeded history without emptying or reordering older ids. */
export function mergeNotificationHydrateWithoutEmpty<T extends { id?: string; clientId?: string }>(
  prev: T[],
  next: T[],
): T[] {
  if (!next.length) return prev;
  if (!prev.length) return next;
  const byKey = new Map<string, T>();
  for (const row of [...prev, ...next]) {
    const key = asId(row.id) || asId(row.clientId);
    if (!key) continue;
    byKey.set(key, row);
  }
  // Prefer next order for shared ids; keep prev-only older rows ahead of next window.
  const nextKeys = new Set(
    next.map((row) => asId(row.id) || asId(row.clientId)).filter(Boolean),
  );
  const older = prev.filter((row) => {
    const key = asId(row.id) || asId(row.clientId);
    return key && !nextKeys.has(key);
  });
  const orderedNext = next.map((row) => {
    const key = asId(row.id) || asId(row.clientId);
    return (key && byKey.get(key)) || row;
  });
  return [...older, ...orderedNext];
}
