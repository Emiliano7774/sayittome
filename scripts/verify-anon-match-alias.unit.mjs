/**
 * R8 — anon-match alias binding: own ALLOWED, foreign DENIED, unbound DENIED, body uid spoof DENIED, profile ALLOWED.
 * Usage: node --experimental-strip-types scripts/verify-anon-match-alias.unit.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bindingUrl = pathToFileURL(
  path.join(root, "src/lib/anonMatch/anonMatchAliasBinding.ts"),
).href;

const {
  decideAnonMatchAliasAuthorization,
  rejectSpoofedRegisteredUid,
  resolveAnonMatchActorIds,
} = await import(bindingUrl);

const CALLER = "firebase_anon_auth_uid";
const OTHER = "other_firebase_auth_uid";
const OWN_ALIAS = "anon_session_own_r8";
const FOREIGN_ALIAS = "anon_session_foreign_r8";
const PROFILE = "registered_profile_uid_r8";

const results = {};

function expectThrow(label, fn, errorName) {
  try {
    fn();
    assert.fail(`${label} should throw`);
  } catch (error) {
    assert.equal(String(error?.message || error), errorName, label);
    results[label] = "DENIED";
  }
}

const ownBound = decideAnonMatchAliasAuthorization({
  callerUid: CALLER,
  callerIsAnonymous: true,
  claimedAnonId: OWN_ALIAS,
  boundAuthUid: CALLER,
});
assert.equal(ownBound.ok, true);
results.own_alias_bound_allowed = "ALLOWED";

const unbound = decideAnonMatchAliasAuthorization({
  callerUid: CALLER,
  callerIsAnonymous: true,
  claimedAnonId: OWN_ALIAS,
  boundAuthUid: null,
});
assert.equal(unbound.ok, false);
assert.equal(unbound.reason, "unbound_alias");
results.unbound_alias_denied = "DENIED";

const foreign = decideAnonMatchAliasAuthorization({
  callerUid: CALLER,
  callerIsAnonymous: true,
  claimedAnonId: FOREIGN_ALIAS,
  boundAuthUid: OTHER,
});
assert.equal(foreign.ok, false);
assert.equal(foreign.reason, "foreign_alias");
results.foreign_alias_denied = "DENIED";

expectThrow("body_uid_spoof_denied", () => {
  rejectSpoofedRegisteredUid(PROFILE, CALLER);
}, "identity_spoof");

const profileActors = resolveAnonMatchActorIds(
  { uid: PROFILE, isAnonymous: false },
  {
    registeredUidField: PROFILE,
    anonIdField: OWN_ALIAS,
  },
);
assert.equal(profileActors.registeredUid, PROFILE);
assert.equal(profileActors.anonId, "");
results.registered_profile_allowed = "ALLOWED";

const profileCannotClaim = decideAnonMatchAliasAuthorization({
  callerUid: PROFILE,
  callerIsAnonymous: false,
  claimedAnonId: OWN_ALIAS,
  boundAuthUid: PROFILE,
});
assert.equal(profileCannotClaim.ok, false);
assert.equal(profileCannotClaim.reason, "profile_cannot_claim_anon");
results.profile_cannot_claim_anon_alias = "DENIED";

rejectSpoofedRegisteredUid(OWN_ALIAS, CALLER);
results.anon_alias_body_uid_not_spoof_checked = "ALLOWED";

console.log(
  JSON.stringify({
    gate: "VERIFY_ANON_MATCH_ALIAS",
    pass: true,
    results,
    note: "Fail-closed: binding must exist before route use; no bindOnFirstUse",
  }),
);
