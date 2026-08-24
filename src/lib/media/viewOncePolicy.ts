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
  if (message.mine) {
    return { ...message, mediaUrl: undefined };
  }
  return { ...message, mediaUrl: undefined };
}
