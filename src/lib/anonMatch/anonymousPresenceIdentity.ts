/**
 * Pure policy for anon-match presence identity.
 * Presence docs in anonimos_activos must use the server-issued match alias,
 * never the local getAnonSessionId() mint used by profile-anon chats.
 */

export const ANON_PRESENCE_ACTIVE_MS = 15 * 60 * 1000;
export const ANON_PRESENCE_HEARTBEAT_MS = 90_000;

export type AnonPresencePublisherKind =
  | "anonymous_firebase"
  | "registered_profile"
  | "unauthenticated";

export function resolveAnonPresencePublisherKind(input: {
  uid?: string | null;
  isAnonymous?: boolean | null;
}): AnonPresencePublisherKind {
  const uid = String(input.uid || "").trim();
  if (!uid) return "unauthenticated";
  if (input.isAnonymous) return "anonymous_firebase";
  return "registered_profile";
}

/** Registered profiles must never publish anonimos_activos (ghost presence). */
export function shouldPublishAnonMatchPresence(
  kind: AnonPresencePublisherKind,
): boolean {
  return kind === "anonymous_firebase";
}

/**
 * Presence document id for the match pool / incoming listener.
 * Must equal the server-issued anon_* alias watched by AnonMatchContext.
 */
export function resolveAnonPresenceDocId(input: {
  serverAnonAlias: string;
  localAnonSessionId?: string;
}): string {
  const alias = String(input.serverAnonAlias || "").trim();
  if (alias.startsWith("anon_") && alias !== "anon_server") return alias;
  return "";
}

/** Legacy local session id may be cleaned only when it differs from the server alias. */
export function resolveLegacyAnonPresenceCleanupId(input: {
  serverAnonAlias: string;
  localAnonSessionId: string;
}): string {
  const alias = String(input.serverAnonAlias || "").trim();
  const local = String(input.localAnonSessionId || "").trim();
  if (!local.startsWith("anon_") || local === "anon_server") return "";
  if (!alias || local === alias) return "";
  return local;
}

export function decideAnonymousPresenceWrite(input: {
  callerIsAnonymous: boolean;
  boundServerAlias: string;
  claimedAnonId?: string;
}):
  | { ok: true; anonId: string }
  | {
      ok: false;
      reason:
        | "profile_cannot_publish_anon_presence"
        | "missing_server_alias"
        | "alias_spoof"
        | "unbound_alias";
    } {
  if (!input.callerIsAnonymous) {
    return { ok: false, reason: "profile_cannot_publish_anon_presence" };
  }
  const bound = String(input.boundServerAlias || "").trim();
  if (!bound.startsWith("anon_") || bound === "anon_server") {
    return { ok: false, reason: "missing_server_alias" };
  }
  const claimed = String(input.claimedAnonId || "").trim();
  if (claimed && claimed !== bound) {
    return { ok: false, reason: "alias_spoof" };
  }
  return { ok: true, anonId: bound };
}

export function decideLegacyAnonPresenceCleanup(input: {
  callerIsAnonymous: boolean;
  callerUid: string;
  legacyLocalAnonId: string;
  boundAuthUidForLegacy: string | null;
}):
  | { ok: true; anonId: string }
  | {
      ok: false;
      reason: "profile_cannot_cleanup" | "invalid_legacy_id" | "foreign_alias";
    } {
  if (!input.callerIsAnonymous) {
    return { ok: false, reason: "profile_cannot_cleanup" };
  }
  const legacy = String(input.legacyLocalAnonId || "").trim();
  if (!legacy.startsWith("anon_") || legacy === "anon_server") {
    return { ok: false, reason: "invalid_legacy_id" };
  }
  const bound = String(input.boundAuthUidForLegacy || "").trim();
  // Bound to another auth uid → refuse (do not delete someone else's server alias).
  if (bound && bound !== input.callerUid) {
    return { ok: false, reason: "foreign_alias" };
  }
  // Unbound legacy docs (pre-alias era) or own binding → allow best-effort cleanup.
  return { ok: true, anonId: legacy };
}
