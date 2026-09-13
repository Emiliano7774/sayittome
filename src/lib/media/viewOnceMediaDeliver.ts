import {
  decideViewOnceMediaAccess,
  decideViewOnceMediaRequestGate,
  type ViewOnceMediaAccessBody,
  type ViewOnceMediaDeliveryGrant,
} from "@/lib/media/viewOnceMediaAccess";

export const VIEW_ONCE_SECRETS_COLLECTION = "viewOnceSecrets";
export const VIEW_ONCE_FIELD_DELETE = Symbol("viewOnceFieldDelete");

export function viewOnceSecretDocId(chatId: string, messageId: string) {
  return `${String(chatId || "").trim()}_${String(messageId || "").trim()}`;
}

export type ViewOnceDeliverRef = {
  path: string;
  /** Opaque Admin DocumentReference when wired through the API route. */
  _ref?: unknown;
};

export type ViewOnceDeliverTx = {
  get: (ref: ViewOnceDeliverRef) => Promise<{
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
  }>;
  set: (
    ref: ViewOnceDeliverRef,
    data: Record<string, unknown>,
    options?: { merge?: boolean },
  ) => void;
  delete: (ref: ViewOnceDeliverRef) => void;
};

export type ViewOnceDeliverDb = {
  runTransaction: <T>(fn: (tx: ViewOnceDeliverTx) => Promise<T>) => Promise<T>;
  collection: (name: string) => {
    doc: (id: string) => ViewOnceDeliverRef;
  };
};

export type ViewOnceMediaFetchResult = {
  ok: boolean;
  status: number;
  contentType: string;
  body: ArrayBuffer | null;
};

export type ViewOnceMediaDeliveryResult =
  | { ok: true; bytes: ArrayBuffer; contentType: string }
  | {
      ok: false;
      status: number;
      error: string;
      gate: "DENIED" | "FAILED";
    };

export type ReservedViewOnceGrant = {
  chatId: string;
  messageId: string;
  mediaUrl: string;
  consumeSecret: boolean;
  reservationId: string;
  grant: {
    deliveryUid: string;
    deliveryExpiresAtMs: number;
    deliveryConsumeSecret: boolean;
    mediaUrl: string;
  };
};

function grantFromSecretData(data: Record<string, unknown> | undefined): ViewOnceMediaDeliveryGrant | null {
  if (!data) return null;
  return {
    mediaUrl: String(data.mediaUrl || "").trim() || undefined,
    deliveryUid: String(data.deliveryUid || "").trim() || undefined,
    deliveryExpiresAtMs: Number(data.deliveryExpiresAtMs) || undefined,
    deliveryConsumeSecret: data.deliveryConsumeSecret === true,
  };
}

/** True only while this reservation still owns the secret doc. */
export function isViewOnceReservationOwner(input: {
  doc: Record<string, unknown> | null | undefined;
  reservationId: string;
}): boolean {
  const live = String(input.doc?.deliveryReservationId || "").trim();
  const want = String(input.reservationId || "").trim();
  return Boolean(live && want && live === want);
}

export function createViewOnceReservationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function reservePatch(fieldDelete: unknown, reservationId: string) {
  return {
    deliveryUid: fieldDelete,
    deliveryExpiresAtMs: fieldDelete,
    deliveryConsumeSecret: fieldDelete,
    deliveryReservationId: reservationId,
  };
}

/**
 * Atomically authorize + consume the short-lived delivery grant.
 * Stamps deliveryReservationId so restore/finalize never touch a later claim grant.
 */
export async function reserveViewOnceMediaGrant(input: {
  db: ViewOnceDeliverDb;
  uid: string;
  body: ViewOnceMediaAccessBody;
  nowMs?: number;
  fieldDelete?: unknown;
  createReservationId?: () => string;
}): Promise<
  | { status: "ALLOWED"; reserved: ReservedViewOnceGrant }
  | {
      status: "DENIED";
      reason:
        | "unauthenticated"
        | "proxy_forbidden"
        | "invalid_payload"
        | "not_member_claim"
        | "expired"
        | "missing_media";
    }
> {
  const chatId = String(input.body?.chatId || "").trim();
  const messageId = String(input.body?.messageId || "").trim();
  const fieldDelete = input.fieldDelete ?? VIEW_ONCE_FIELD_DELETE;

  const gated = decideViewOnceMediaRequestGate({ uid: input.uid, body: input.body });
  if (gated) return gated;

  return input.db.runTransaction(async (tx) => {
    const secretRef = input.db
      .collection(VIEW_ONCE_SECRETS_COLLECTION)
      .doc(viewOnceSecretDocId(chatId, messageId));
    const snap = await tx.get(secretRef);
    const delivery = grantFromSecretData(snap.exists ? snap.data() : undefined);
    const decision = decideViewOnceMediaAccess({
      uid: input.uid,
      body: input.body,
      delivery,
      nowMs: input.nowMs,
    });
    if (decision.status === "DENIED") {
      return decision;
    }

    const reservationId = String(
      (input.createReservationId || createViewOnceReservationId)() || "",
    ).trim();
    if (!reservationId) {
      return { status: "DENIED" as const, reason: "missing_media" as const };
    }

    const reserved: ReservedViewOnceGrant = {
      chatId,
      messageId,
      mediaUrl: decision.mediaUrl,
      consumeSecret: decision.consumeSecret,
      reservationId,
      grant: {
        mediaUrl: decision.mediaUrl,
        deliveryUid: String(delivery?.deliveryUid || "").trim(),
        deliveryExpiresAtMs: Number(delivery?.deliveryExpiresAtMs) || 0,
        deliveryConsumeSecret: decision.consumeSecret,
      },
    };

    // Consume grant + stamp reservation before any byte leaves the server.
    tx.set(secretRef, reservePatch(fieldDelete, reservationId), { merge: true });
    return { status: "ALLOWED" as const, reserved };
  });
}

/**
 * Keep the original claim expiry on restore. Never extend TTL on upstream failure.
 * If the original window already elapsed, skip restore entirely.
 */
export function resolveViewOnceGrantRestoreExpiry(input: {
  originalExpiresAtMs: number;
  nowMs?: number;
}): { ok: true; deliveryExpiresAtMs: number } | { ok: false; reason: "expired" } {
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const original = Number(input.originalExpiresAtMs);
  if (!Number.isFinite(original) || original < nowMs) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, deliveryExpiresAtMs: original };
}

/**
 * Put the grant back after a failed upstream fetch — only if this reservation still owns the doc.
 * Never overwrite a later claim B grant.
 * If the grant already expired: still clean up our reservation stamp (and delete exhausted secrets).
 */
export async function restoreViewOnceMediaGrant(input: {
  db: ViewOnceDeliverDb;
  reserved: ReservedViewOnceGrant;
  nowMs?: number;
  fieldDelete?: unknown;
}): Promise<{
  restored: boolean;
  reason?: "expired" | "superseded" | "missing";
  cleaned?: boolean;
}> {
  const fieldDelete = input.fieldDelete ?? VIEW_ONCE_FIELD_DELETE;
  const secretRef = input.db
    .collection(VIEW_ONCE_SECRETS_COLLECTION)
    .doc(viewOnceSecretDocId(input.reserved.chatId, input.reserved.messageId));

  const expiry = resolveViewOnceGrantRestoreExpiry({
    originalExpiresAtMs: input.reserved.grant.deliveryExpiresAtMs,
    nowMs: input.nowMs,
  });

  if (!expiry.ok) {
    // Expired: do not re-arm deliveryUid, but drop orphan reservation / exhausted secret if we still own it.
    return input.db.runTransaction(async (tx) => {
      const snap = await tx.get(secretRef);
      if (!snap.exists) {
        return { restored: false as const, reason: "expired" as const, cleaned: false };
      }
      const existing = snap.data() || {};
      if (
        !isViewOnceReservationOwner({
          doc: existing,
          reservationId: input.reserved.reservationId,
        })
      ) {
        return { restored: false as const, reason: "superseded" as const, cleaned: false };
      }

      if (input.reserved.consumeSecret) {
        tx.delete(secretRef);
      } else {
        tx.set(
          secretRef,
          {
            mediaUrl: String(existing.mediaUrl || input.reserved.grant.mediaUrl || "").trim(),
            deliveryReservationId: fieldDelete,
          },
          { merge: true },
        );
      }
      return { restored: false as const, reason: "expired" as const, cleaned: true };
    });
  }

  return input.db.runTransaction(async (tx) => {
    const snap = await tx.get(secretRef);
    if (!snap.exists) {
      return { restored: false as const, reason: "missing" as const };
    }
    const existing = snap.data() || {};
    if (
      !isViewOnceReservationOwner({
        doc: existing,
        reservationId: input.reserved.reservationId,
      })
    ) {
      return { restored: false as const, reason: "superseded" as const };
    }

    const mediaUrl =
      String(input.reserved.grant.mediaUrl || "").trim() || String(existing.mediaUrl || "").trim();
    tx.set(
      secretRef,
      {
        ...existing,
        mediaUrl,
        deliveryUid: input.reserved.grant.deliveryUid,
        deliveryExpiresAtMs: expiry.deliveryExpiresAtMs,
        deliveryConsumeSecret: input.reserved.grant.deliveryConsumeSecret,
        deliveryReservationId: fieldDelete,
      },
      { merge: true },
    );
    return { restored: true as const };
  });
}

/**
 * After bytes are safely buffered: delete secret when exhausted — only if reservation still owns it.
 * Never delete a later claim B grant/secret.
 */
export async function finalizeViewOnceMediaGrant(input: {
  db: ViewOnceDeliverDb;
  reserved: ReservedViewOnceGrant;
  fieldDelete?: unknown;
}): Promise<{ finalized: boolean; reason?: "not_consume" | "superseded" | "missing" }> {
  const fieldDelete = input.fieldDelete ?? VIEW_ONCE_FIELD_DELETE;

  if (!input.reserved.consumeSecret) {
    // Clear reservation stamp if we still own it so a later claim is unambiguous.
    const secretRef = input.db
      .collection(VIEW_ONCE_SECRETS_COLLECTION)
      .doc(viewOnceSecretDocId(input.reserved.chatId, input.reserved.messageId));
    const cleared = await input.db.runTransaction(async (tx) => {
      const snap = await tx.get(secretRef);
      if (!snap.exists) {
        return { finalized: false as const, reason: "missing" as const };
      }
      const existing = snap.data() || {};
      if (
        !isViewOnceReservationOwner({
          doc: existing,
          reservationId: input.reserved.reservationId,
        })
      ) {
        return { finalized: false as const, reason: "superseded" as const };
      }
      tx.set(secretRef, { deliveryReservationId: fieldDelete }, { merge: true });
      return { finalized: false as const, reason: "not_consume" as const };
    });
    return cleared;
  }

  const secretRef = input.db
    .collection(VIEW_ONCE_SECRETS_COLLECTION)
    .doc(viewOnceSecretDocId(input.reserved.chatId, input.reserved.messageId));

  return input.db.runTransaction(async (tx) => {
    const snap = await tx.get(secretRef);
    if (!snap.exists) {
      return { finalized: false as const, reason: "missing" as const };
    }
    const existing = snap.data() || {};
    if (
      !isViewOnceReservationOwner({
        doc: existing,
        reservationId: input.reserved.reservationId,
      })
    ) {
      return { finalized: false as const, reason: "superseded" as const };
    }
    tx.delete(secretRef);
    return { finalized: true as const };
  });
}

/**
 * Full delivery path: reserve → fetch buffer → finalize / restore.
 * Never streams bytes before the grant is consumed; never silences restore/finalize failures.
 * Restore/finalize are no-ops (not errors) when a later claim superseded this reservation.
 */
export async function executeViewOnceMediaDelivery(input: {
  db: ViewOnceDeliverDb;
  uid: string;
  body: ViewOnceMediaAccessBody;
  fetchMedia: (url: string) => Promise<ViewOnceMediaFetchResult>;
  nowMs?: number;
  fieldDelete?: unknown;
  createReservationId?: () => string;
}): Promise<ViewOnceMediaDeliveryResult> {
  let reserved: ReservedViewOnceGrant;

  try {
    const reservation = await reserveViewOnceMediaGrant({
      db: input.db,
      uid: input.uid,
      body: input.body,
      nowMs: input.nowMs,
      fieldDelete: input.fieldDelete,
      createReservationId: input.createReservationId,
    });
    if (reservation.status === "DENIED") {
      const status =
        reservation.reason === "unauthenticated"
          ? 401
          : reservation.reason === "proxy_forbidden" || reservation.reason === "invalid_payload"
            ? 400
            : 403;
      return { ok: false, status, error: reservation.reason, gate: "DENIED" };
    }
    reserved = reservation.reserved;
  } catch {
    return { ok: false, status: 503, error: "reserve_failed", gate: "FAILED" };
  }

  let upstream: ViewOnceMediaFetchResult;
  try {
    upstream = await input.fetchMedia(reserved.mediaUrl);
  } catch {
    try {
      await restoreViewOnceMediaGrant({
        db: input.db,
        reserved,
        nowMs: input.nowMs,
        fieldDelete: input.fieldDelete,
      });
    } catch {
      return { ok: false, status: 503, error: "restore_failed", gate: "FAILED" };
    }
    return { ok: false, status: 502, error: "media_fetch_failed", gate: "FAILED" };
  }

  if (!upstream.ok || !upstream.body) {
    try {
      await restoreViewOnceMediaGrant({
        db: input.db,
        reserved,
        nowMs: input.nowMs,
        fieldDelete: input.fieldDelete,
      });
    } catch {
      return { ok: false, status: 503, error: "restore_failed", gate: "FAILED" };
    }
    return { ok: false, status: 502, error: "media_fetch_failed", gate: "FAILED" };
  }

  try {
    await finalizeViewOnceMediaGrant({
      db: input.db,
      reserved,
      fieldDelete: input.fieldDelete,
    });
  } catch {
    try {
      await restoreViewOnceMediaGrant({
        db: input.db,
        reserved,
        nowMs: input.nowMs,
        fieldDelete: input.fieldDelete,
      });
    } catch {
      return { ok: false, status: 503, error: "finalize_restore_failed", gate: "FAILED" };
    }
    return { ok: false, status: 503, error: "finalize_failed", gate: "FAILED" };
  }

  return {
    ok: true,
    bytes: upstream.body,
    contentType: upstream.contentType || "application/octet-stream",
  };
}
