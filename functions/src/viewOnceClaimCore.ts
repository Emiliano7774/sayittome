export const VIEW_ONCE_MIN_LIMIT = 1;
export const VIEW_ONCE_MAX_LIMIT = 5;
export const VIEW_ONCE_DEFAULT_LIMIT = 1;
export const VIEW_ONCE_SECRETS_COLLECTION = "viewOnceSecrets";

export type ViewOnceMessageFields = {
  viewOnce?: boolean;
  viewOnceLimit?: number;
  viewOnceOpenedCount?: number;
  viewOnceExhausted?: boolean;
  viewOnceSealed?: boolean;
  mediaUrl?: string;
  fromUid?: string;
  ownerId?: string;
  senderUid?: string;
  senderAuthUid?: string;
  createdByAuthUid?: string;
  senderRole?: string;
  senderKind?: string;
  profileUid?: string;
  senderProfileId?: string;
};

/** Legacy messages without viewOnceLimit count as 1. */
export function normalizeViewOnceLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < VIEW_ONCE_MIN_LIMIT) return VIEW_ONCE_DEFAULT_LIMIT;
  if (n > VIEW_ONCE_MAX_LIMIT) return VIEW_ONCE_MAX_LIMIT;
  return Math.floor(n);
}

export function viewOnceSecretDocId(chatId: string, messageId: string) {
  return `${String(chatId || "").trim()}_${String(messageId || "").trim()}`;
}

export function resolveViewOnceAuthorIds(message: ViewOnceMessageFields): Set<string> {
  const ids = new Set<string>();
  for (const value of [
    message.fromUid,
    message.ownerId,
    message.senderUid,
    message.senderAuthUid,
    message.createdByAuthUid,
    message.profileUid,
    message.senderProfileId,
  ]) {
    const id = String(value || "").trim();
    if (!id) continue;
    ids.add(id);
    if (id.startsWith("profile_")) ids.add(id.slice("profile_".length));
    else ids.add(`profile_${id}`);
  }
  return ids;
}

export function isViewOnceAuthor(uid: string, message: ViewOnceMessageFields) {
  const clean = String(uid || "").trim();
  if (!clean) return false;
  const authors = resolveViewOnceAuthorIds(message);
  return authors.has(clean) || authors.has(`profile_${clean}`);
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

export type ViewOnceClaimDecision =
  | {
      ok: true;
      mediaUrl: string;
      openedCount: number;
      limit: number;
      remaining: number;
      exhausted: boolean;
    }
  | {
      ok: false;
      reason: "not-view-once" | "exhausted" | "missing-media" | "author" | "not-member";
      openedCount: number;
      limit: number;
      remaining: number;
      exhausted: boolean;
    };

export function decideViewOnceClaim(input: {
  uid: string;
  isMember: boolean;
  message: ViewOnceMessageFields;
  secretMediaUrl?: string;
}): ViewOnceClaimDecision {
  const message = input.message || {};
  const limit = normalizeViewOnceLimit(message.viewOnceLimit);
  const opened = Math.max(0, Math.floor(Number(message.viewOnceOpenedCount) || 0));
  const remainingBefore = Math.max(0, limit - opened);

  if (!message.viewOnce) {
    return {
      ok: false,
      reason: "not-view-once",
      openedCount: opened,
      limit,
      remaining: remainingBefore,
      exhausted: true,
    };
  }

  if (isViewOnceAuthor(input.uid, message)) {
    return {
      ok: false,
      reason: "author",
      openedCount: opened,
      limit,
      remaining: remainingBefore,
      exhausted: remainingBefore <= 0 || message.viewOnceExhausted === true,
    };
  }

  if (!input.isMember) {
    return {
      ok: false,
      reason: "not-member",
      openedCount: opened,
      limit,
      remaining: remainingBefore,
      exhausted: true,
    };
  }

  if (message.viewOnceExhausted === true || opened >= limit) {
    return {
      ok: false,
      reason: "exhausted",
      openedCount: opened,
      limit,
      remaining: 0,
      exhausted: true,
    };
  }

  const mediaUrl = String(input.secretMediaUrl || message.mediaUrl || "").trim();
  if (!mediaUrl) {
    return {
      ok: false,
      reason: "missing-media",
      openedCount: opened,
      limit,
      remaining: remainingBefore,
      exhausted: remainingBefore <= 0,
    };
  }

  const openedCount = opened + 1;
  const remaining = Math.max(0, limit - openedCount);
  return {
    ok: true,
    mediaUrl,
    openedCount,
    limit,
    remaining,
    exhausted: remaining <= 0,
  };
}
