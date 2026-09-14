/**
 * R8 transition gate — first unauthenticated click must use live caller after auth,
 * not a stale render closure (callerKind=unauthenticated → retry loop).
 * Usage: node --experimental-strip-types scripts/verify-anon-match-first-click.unit.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const consumerUrl = pathToFileURL(
  path.join(root, "src/lib/anonMatch/anonMatchConsumer.ts"),
).href;
const legacyUrl = pathToFileURL(
  path.join(root, "src/lib/anonMatch/anonMatchLegacyTransition.ts"),
).href;

const {
  resolveAnonMatchCallerKind,
  resolveAnonMatchCallerSnapshot,
  buildAnonMatchRequestBody,
} = await import(consumerUrl);

const {
  auditLegacyAnonMatchStoredAlias,
  LEGACY_CLIENT_ALIAS_NO_CRYPTO_PROOF,
} = await import(legacyUrl);

const SERVER_ALIAS = "anon_server_issued_transition";
const results = {};

// Render-time closure before Auth hydrates.
const staleKind = resolveAnonMatchCallerKind(null);
assert.equal(staleKind, "unauthenticated");

// Same tick after ensureStorageAuth + signInAnonymously.
const liveUser = { uid: "firebase_anon_auth_uid", isAnonymous: true };
const live = resolveAnonMatchCallerSnapshot(liveUser);
assert.equal(live.callerKind, "anonymous_firebase");
assert.notEqual(staleKind, live.callerKind);

// Stale closure throws — this was the retry-loop bug on first click.
assert.throws(
  () =>
    buildAnonMatchRequestBody({
      callerKind: staleKind,
      registeredUid: "",
      serverAnonAlias: SERVER_ALIAS,
    }),
  (err) => err instanceof Error && err.message === "unauthenticated",
);

// Live snapshot succeeds immediately with server alias (no retry needed).
const body = buildAnonMatchRequestBody({
  callerKind: live.callerKind,
  registeredUid: live.registeredUid,
  serverAnonAlias: SERVER_ALIAS,
});
assert.equal(body.solicitanteAnonId, SERVER_ALIAS);
assert.equal(body.localAnonId, SERVER_ALIAS);
results.first_click_immediate_body = "ALLOWED";

// Legacy audit: never adopt client-minted alias into anon-match storage.
const contaminated = auditLegacyAnonMatchStoredAlias({
  storedServerAlias: "anon_client_mint_abc",
  legacyClientAlias: "anon_client_mint_abc",
});
assert.equal(contaminated.action, "clear_and_issue");
assert.equal(contaminated.legacyBlocked, true);
assert.equal(contaminated.reason, "stored_alias_matches_unbound_client_mint");
results.legacy_client_alias_rejected = "DENIED";

const freshIssue = auditLegacyAnonMatchStoredAlias({
  storedServerAlias: "",
  legacyClientAlias: "anon_client_mint_xyz",
});
assert.equal(freshIssue.action, "clear_and_issue");
assert.equal(freshIssue.legacyBlocked, true);
results.legacy_client_present_no_adoption = "BLOCKED";

const validStored = auditLegacyAnonMatchStoredAlias({
  storedServerAlias: SERVER_ALIAS,
  legacyClientAlias: "anon_client_mint_xyz",
});
assert.equal(validStored.action, "use_stored");
assert.equal(validStored.legacyBlocked, false);
results.server_alias_distinct_from_legacy = "ALLOWED";

assert.match(LEGACY_CLIENT_ALIAS_NO_CRYPTO_PROOF, /server binding proof/i);
results.crypto_proof_blocker_documented = "DOCUMENTED";

console.log(
  JSON.stringify({
    gate: "VERIFY_ANON_MATCH_FIRST_CLICK",
    pass: true,
    results,
    note: "Live caller snapshot after auth; legacy client alias never adopted",
  }),
);
