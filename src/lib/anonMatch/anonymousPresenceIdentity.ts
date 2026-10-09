/**
 * Pure policy for anon-match presence identity.
 * Presence docs in anonimos_activos must use the server-issued match alias,
 * never the local getAnonSessionId() mint used by profile-anon chats.
 */

/** Foreground lease stays short to avoid inflated active users after a crash. */
export const ANON_PRESENCE_ACTIVE_MS = 15 * 60 * 1000;
/** Background Android/WebView may suspend JavaScript: tolerate longer timer gaps
 * only when the client explicitly reported being hidden. Dead sessions still
 * expire, rather than appearing online indefinitely. */
export const ANON_PRESENCE_BACKGROUND_GRACE_MS = 60 * 60 * 1000;
export const ANON_PRESENCE_HEARTBEAT_MS = 90_000;
/** Anonymous cards stay displayed for 3h after their last successful connection.
 * This is DISCOVERY visibility, never proof that an old session can receive. */
export const ANON_SHUFFLE_VISIBILITY_MS = 3 * 60 * 60 * 1000;
export function anonShuffleVisible(lastSeenAtMs: number, now = Date.now()) {
  return Number.isFinite(lastSeenAtMs) && lastSeenAtMs > 0 &&
    lastSeenAtMs <= now + 30_000 && now - lastSeenAtMs <= ANON_SHUFFLE_VISIBILITY_MS;
}

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

export function isVerifiedAnonMatchPresence(input: {
  id?: string;
  anonId?: string;
  source?: string;
  authUid?: string;
}): boolean {
  const id = String(input.id || "").trim();
  const anonId = String(input.anonId || "").trim();
  const source = String(input.source || "").trim();
  const authUid = String(input.authUid || "").trim();

  if (!id || !anonId || id !== anonId) return false;
  if (!id.startsWith("anon_") || id === "anon_server") return false;
  if (source !== "anon_match_presence") return false;
  if (!authUid) return false;
  return true;
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
      reason:
        | "profile_cannot_cleanup"
        | "invalid_legacy_id"
        | "unowned_legacy"
        | "foreign_alias";
    } {
  if (!input.callerIsAnonymous) {
    return { ok: false, reason: "profile_cannot_cleanup" };
  }
  const legacy = String(input.legacyLocalAnonId || "").trim();
  if (!legacy.startsWith("anon_") || legacy === "anon_server") {
    return { ok: false, reason: "invalid_legacy_id" };
  }
  const callerUid = String(input.callerUid || "").trim();
  const bound = String(input.boundAuthUidForLegacy || "").trim();
  if (!bound) {
    return { ok: false, reason: "unowned_legacy" };
  }
  if (bound !== callerUid) {
    return { ok: false, reason: "foreign_alias" };
  }
  return { ok: true, anonId: legacy };
}
