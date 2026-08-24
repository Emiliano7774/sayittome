export const VIEW_ONCE_MIN_LIMIT = 1;
export const VIEW_ONCE_MAX_LIMIT = 5;
export const VIEW_ONCE_DEFAULT_LIMIT = 1;

/** Legacy messages without viewOnceLimit count as 1. */
export function normalizeViewOnceLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < VIEW_ONCE_MIN_LIMIT) return VIEW_ONCE_DEFAULT_LIMIT;
  if (n > VIEW_ONCE_MAX_LIMIT) return VIEW_ONCE_MAX_LIMIT;
  return Math.floor(n);
}

export function viewOnceRemaining(input: {
  viewOnce?: boolean;
  viewOnceLimit?: unknown;
  viewOnceOpenedCount?: unknown;
  viewOnceExhausted?: boolean;
}) {
  if (!input.viewOnce) return null;
  if (input.viewOnceExhausted) return 0;
  const limit = normalizeViewOnceLimit(input.viewOnceLimit);
  const opened = Math.max(0, Math.floor(Number(input.viewOnceOpenedCount) || 0));
  return Math.max(0, limit - opened);
}

/** Recipients never get mediaUrl from the listener — only via claim. */
export function redactViewOnceMediaUrl<T extends {
  viewOnce?: boolean;
  mediaUrl?: string;
  mine?: boolean;
}>(message: T): T {
  if (!message.viewOnce) return message;
  return { ...message, mediaUrl: undefined };
}

/**
 * Public Firestore fields for a newborn bomb: no mediaUrl/secret.
 * Media is attached only via commitViewOnceSecret (Admin).
 */
export function buildViewOncePublicBirthFields(input: {
  viewOnceLimit?: unknown;
}): {
  viewOnce: true;
  viewOnceLimit: number;
  viewOnceOpenedCount: 0;
  viewOnceExhausted: false;
  viewOnceSealed: false;
} {
  return {
    viewOnce: true,
    viewOnceLimit: normalizeViewOnceLimit(input.viewOnceLimit),
    viewOnceOpenedCount: 0,
    viewOnceExhausted: false,
    viewOnceSealed: false,
  };
}

/** Listener-safe: bomb docs must never expose mediaUrl to clients. */
export function assertNoClientReadableViewOnceMedia(message: {
  viewOnce?: boolean;
  mediaUrl?: string | null;
}): boolean {
  if (!message.viewOnce) return true;
  return !String(message.mediaUrl || "").trim();
}
