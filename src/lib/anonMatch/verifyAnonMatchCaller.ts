import { verifyFirebaseIdTokenAllowingAnonymous } from "@/lib/admin/verifyAdminRequest";
import {
  decideAnonMatchAliasAuthorization,
  isAnonMatchSessionAlias,
  rejectSpoofedRegisteredUid,
  resolveAnonMatchActorIds,
} from "@/lib/anonMatch/anonMatchAliasBinding";
import {
  issueServerAnonMatchAlias,
  lookupAnonMatchAliasBinding,
  lookupActiveAnonMatchAliasForAuth,
} from "@/lib/anonMatch/anonMatchAliasAdmin";

export type VerifiedAnonMatchCaller = {
  uid: string;
  isAnonymous: boolean;
};

type TestAuthOverride = (req: Request) => Promise<VerifiedAnonMatchCaller>;

const testAuthOverride: { fn: TestAuthOverride | null } = { fn: null };

/** Integration harness only — never set outside ANON_MATCH_INTEGRATION_TEST. */
export function setAnonMatchTestAuthOverride(fn: TestAuthOverride | null) {
  if (process.env.ANON_MATCH_INTEGRATION_TEST !== "1") return;
  testAuthOverride.fn = fn;
}

/**
 * Anon-match APIs must not trust solicitante/responder identity from the body.
 * Caller Firebase uid is authoritative; anon session ids are verified against
 * private server-issued alias binding docs before use.
 */
export async function verifyAnonMatchCaller(req: Request): Promise<VerifiedAnonMatchCaller> {
  if (testAuthOverride.fn) {
    return testAuthOverride.fn(req);
  }
  const principal = await verifyFirebaseIdTokenAllowingAnonymous(req);
  const uid = String(principal.uid || "").trim();
  if (!uid) {
    throw Object.assign(new Error("unauthenticated"), { status: 401 });
  }
  return {
    uid,
    isAnonymous: Boolean(principal.isAnonymous),
  };
}

export {
  isAnonMatchSessionAlias,
  rejectSpoofedRegisteredUid,
  rejectSpoofedRegisteredUid as rejectSpoofedUid,
  resolveAnonMatchActorIds,
  issueServerAnonMatchAlias,
  lookupAnonMatchAliasBinding,
  lookupActiveAnonMatchAliasForAuth,
};

/** Registered Firebase uid for profile callers; empty for anonymous Auth visitors. */
export function resolveAnonMatchRegisteredUid(caller: VerifiedAnonMatchCaller): string {
  return caller.isAnonymous ? "" : caller.uid;
}

/**
 * Ensures anon_* alias in the body belongs to the authenticated anonymous caller.
 * Binding must already exist (server-issued via bind-alias); fail closed if missing.
 */
export async function assertAnonMatchAliasForCaller(
  caller: VerifiedAnonMatchCaller,
  claimedAnonId: unknown,
): Promise<string> {
  const anonId = String(claimedAnonId || "").trim();
  if (!caller.isAnonymous) {
    throw Object.assign(new Error("profile_cannot_claim_anon"), { status: 403 });
  }
  if (!isAnonMatchSessionAlias(anonId)) {
    throw Object.assign(new Error("missing_anon_alias"), { status: 400 });
  }

  const boundAuthUid = await lookupAnonMatchAliasBinding(anonId);
  const decision = decideAnonMatchAliasAuthorization({
    callerUid: caller.uid,
    callerIsAnonymous: true,
    claimedAnonId: anonId,
    boundAuthUid,
  });
  if (!decision.ok) {
    throw Object.assign(new Error(decision.reason), { status: 403 });
  }
  return anonId;
}
