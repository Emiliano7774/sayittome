/** Private anon session alias docs — client SDK deny-all; server Admin only. */
export const ANON_MATCH_ALIAS_COLLECTION = "anon_abuse_anon_aliases";
/** Active server-issued alias per Firebase anonymous auth uid. */
export const ANON_MATCH_AUTH_SESSION_COLLECTION = "anon_abuse_anon_match_sessions";

export function isAnonMatchSessionAlias(value: unknown): boolean {
  const id = String(value || "").trim();
  return id.startsWith("anon_") && id !== "anon_server";
}

/** Reject registered Firebase uid claims that do not match Bearer auth. */
export function rejectSpoofedRegisteredUid(bodyUid: unknown, callerUid: string) {
  const claimed = String(bodyUid || "").trim();
  if (!claimed || isAnonMatchSessionAlias(claimed)) return;
  if (claimed !== callerUid) {
    throw Object.assign(new Error("identity_spoof"), { status: 403 });
  }
}

export type AnonAliasDecision =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "foreign_alias"
        | "profile_cannot_claim_anon"
        | "missing_alias"
        | "unbound_alias";
    };

export function decideAnonMatchAliasAuthorization(input: {
  callerUid: string;
  callerIsAnonymous: boolean;
  claimedAnonId: string;
  boundAuthUid?: string | null;
}): AnonAliasDecision {
  const claimed = String(input.claimedAnonId || "").trim();
  if (!claimed || !isAnonMatchSessionAlias(claimed)) {
    return { ok: false, reason: "missing_alias" };
  }
  if (!input.callerIsAnonymous) {
    return { ok: false, reason: "profile_cannot_claim_anon" };
  }

  const bound = String(input.boundAuthUid || "").trim();
  if (!bound) return { ok: false, reason: "unbound_alias" };
  if (bound !== input.callerUid) return { ok: false, reason: "foreign_alias" };
  return { ok: true };
}

/** Registered profile callers use Firebase uid; anonymous callers must supply a bound anon alias. */
export function resolveAnonMatchActorIds(
  caller: { uid: string; isAnonymous: boolean },
  body: {
    registeredUidField?: unknown;
    anonIdField?: unknown;
    anonIdFallback?: unknown;
  },
): { registeredUid: string; anonId: string } {
  rejectSpoofedRegisteredUid(body.registeredUidField, caller.uid);
  const registeredUid = caller.isAnonymous ? "" : caller.uid;
  const anonId = caller.isAnonymous
    ? String(body.anonIdField ?? body.anonIdFallback ?? "").trim()
    : "";
  return { registeredUid, anonId };
}
