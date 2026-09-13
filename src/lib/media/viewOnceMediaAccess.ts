export const VIEW_ONCE_DELIVERY_TTL_MS = 120_000;
export const VIEW_ONCE_STORAGE_BUCKET = "sayittome-app.firebasestorage.app";

export type ViewOnceMediaDeliveryGrant = {
  mediaUrl?: string;
  deliveryUid?: string;
  deliveryExpiresAtMs?: number;
  deliveryConsumeSecret?: boolean;
};

export type ViewOnceMediaAccessBody = {
  chatId?: unknown;
  messageId?: unknown;
  mediaUrl?: unknown;
};

export type ViewOnceMediaAccessResult =
  | { status: "ALLOWED"; mediaUrl: string; consumeSecret: boolean }
  | {
      status: "DENIED";
      reason:
        | "unauthenticated"
        | "proxy_forbidden"
        | "invalid_payload"
        | "not_member_claim"
        | "expired"
        | "missing_media";
    };

export function viewOnceDeliveryDocFields(input: {
  uid: string;
  mediaUrl: string;
  consumeSecret: boolean;
  nowMs?: number;
}): {
  mediaUrl: string;
  deliveryUid: string;
  deliveryExpiresAtMs: number;
  deliveryConsumeSecret: boolean;
} {
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  return {
    mediaUrl: String(input.mediaUrl || "").trim(),
    deliveryUid: String(input.uid || "").trim(),
    deliveryExpiresAtMs: nowMs + VIEW_ONCE_DELIVERY_TTL_MS,
    deliveryConsumeSecret: input.consumeSecret === true,
  };
}

export function isAllowedBombMediaUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;

    if (url.hostname === "firebasestorage.googleapis.com") {
      const prefix = `/v0/b/${VIEW_ONCE_STORAGE_BUCKET}/o/`;
      if (!url.pathname.startsWith(prefix)) return false;
      const objectPath = decodeURIComponent(url.pathname.slice(prefix.length));
      return objectPath.startsWith("chats/");
    }

    if (url.hostname === "storage.googleapis.com") {
      return decodeURIComponent(url.pathname).startsWith(`/${VIEW_ONCE_STORAGE_BUCKET}/chats/`);
    }

    return false;
  } catch {
    return false;
  }
}

/** Request-shape gates before reading the claim grant. */
export function decideViewOnceMediaRequestGate(input: {
  uid: string;
  body: ViewOnceMediaAccessBody;
}): Extract<ViewOnceMediaAccessResult, { status: "DENIED" }> | null {
  const uid = String(input.uid || "").trim();
  if (!uid) {
    return { status: "DENIED", reason: "unauthenticated" };
  }

  const body = input.body || {};
  if (
    Object.prototype.hasOwnProperty.call(body, "mediaUrl") &&
    body.mediaUrl != null &&
    String(body.mediaUrl).trim() !== ""
  ) {
    return { status: "DENIED", reason: "proxy_forbidden" };
  }

  const chatId = String(body.chatId || "").trim();
  const messageId = String(body.messageId || "").trim();
  if (!chatId || !messageId) {
    return { status: "DENIED", reason: "invalid_payload" };
  }

  return null;
}

/**
 * Authorize POST /api/view-once/media after claim.
 * Never accepts client mediaUrl (no open proxy). Delivery must match uid+claim grant.
 */
export function decideViewOnceMediaAccess(input: {
  uid: string;
  body: ViewOnceMediaAccessBody;
  delivery: ViewOnceMediaDeliveryGrant | null;
  nowMs?: number;
}): ViewOnceMediaAccessResult {
  const gated = decideViewOnceMediaRequestGate({ uid: input.uid, body: input.body });
  if (gated) return gated;

  const uid = String(input.uid || "").trim();
  const delivery = input.delivery;
  if (!delivery) {
    return { status: "DENIED", reason: "not_member_claim" };
  }

  const deliveryUid = String(delivery.deliveryUid || "").trim();
  if (!deliveryUid || deliveryUid !== uid) {
    return { status: "DENIED", reason: "not_member_claim" };
  }

  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const expiresAt = Number(delivery.deliveryExpiresAtMs);
  if (!Number.isFinite(expiresAt) || expiresAt < nowMs) {
    return { status: "DENIED", reason: "expired" };
  }

  const mediaUrl = String(delivery.mediaUrl || "").trim();
  if (!mediaUrl || !isAllowedBombMediaUrl(mediaUrl)) {
    return { status: "DENIED", reason: "missing_media" };
  }

  return {
    status: "ALLOWED",
    mediaUrl,
    consumeSecret: delivery.deliveryConsumeSecret === true,
  };
}
