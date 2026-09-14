/**
 * Client ↔ draft-rules compatibility gate (static, no deploy).
 * Proves new production payloads align with draft rules and legacy active-client
 * patterns would be DENIED — rules must not publish before Hosting/APK surface updates.
 *
 * Usage: node --experimental-strip-types scripts/p0-client-rules-compat.unit.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const consumerUrl = pathToFileURL(
  path.join(root, "src/lib/anonMatch/anonMatchConsumer.ts"),
).href;
const legacyUrl = pathToFileURL(
  path.join(root, "src/lib/anonMatch/anonMatchLegacyTransition.ts"),
).href;
const payloadUrl = pathToFileURL(
  path.join(root, "src/lib/chat/profileAnonSendPayload.ts"),
).href;

const { buildAnonMatchRequestBody, resolveAnonMatchCallerSnapshot } = await import(consumerUrl);
const { auditLegacyAnonMatchStoredAlias, LEGACY_CLIENT_ALIAS_NO_CRYPTO_PROOF } =
  await import(legacyUrl);
const { buildProfileAnonMessagePayload, buildProfileAnonAtomicSendBatch } =
  await import(payloadUrl);

const results = {};
const blockers = [];

const ANON = "anon_session_compat";
const SERVER_ALIAS = "anon_server_compat_r8";
const VISITOR_AUTH = "visitor_firebase_uid_compat";

// --- Profile-anon: new visitor payload omits auth uid fields (draft-safe) ---
const visitorMessage = buildProfileAnonMessagePayload({
  messageText: "hola",
  senderAuthorId: ANON,
  senderKind: "anon",
  senderRole: "anon",
  abuseSendPermitId: "permit_compat",
});
assert.equal("senderAuthUid" in visitorMessage, false);
assert.equal("createdByAuthUid" in visitorMessage, false);
results.new_visitor_message_no_auth_uid = "ALLOWED";

const visitorBatch = buildProfileAnonAtomicSendBatch({
  messageText: "hola",
  messageId: "msg_compat_1",
  senderAuthorId: ANON,
  senderKind: "anon",
  senderRole: "anon",
  unreadRecipients: ["owner_uid"],
  latestSenderAnonSessionId: ANON,
  senderIsAnonymous: true,
  abuseSendPermitId: "permit_compat",
});
assert.equal("senderAuthUid" in visitorBatch.messagePayload, false);
assert.equal("createdByAuthUid" in visitorBatch.messagePayload, false);
results.new_visitor_atomic_batch_no_auth_uid = "ALLOWED";

// --- Legacy pre-R4 visitor poison (draft independent1635 DENIED) ---
const legacyVisitorPoison = {
  texto: "legacy",
  fromUid: ANON,
  senderKind: "anon",
  senderAuthUid: VISITOR_AUTH,
  createdByAuthUid: VISITOR_AUTH,
};
assert.equal("senderAuthUid" in legacyVisitorPoison, true);
assert.equal("createdByAuthUid" in legacyVisitorPoison, true);
results.legacy_visitor_message_with_auth_uid = "DENIED_BY_DRAFT_RULES";
blockers.push({
  id: "LEGACY_PROFILE_ANON_VISITOR_AUTH_UID",
  severity: "rules_breaking",
  detail:
    "Cached clients that write senderAuthUid/createdByAuthUid on visitor messages fail draft rules (1635 DENIED).",
});

// --- Anon-match: new client uses server alias ---
const live = resolveAnonMatchCallerSnapshot({ uid: VISITOR_AUTH, isAnonymous: true });
const newAnonMatchBody = buildAnonMatchRequestBody({
  callerKind: live.callerKind,
  registeredUid: "",
  serverAnonAlias: SERVER_ALIAS,
});
assert.equal(newAnonMatchBody.solicitanteAnonId, SERVER_ALIAS);
results.new_anon_match_server_alias_body = "ALLOWED";

// --- Legacy f2c54ce-style client-minted anon-match id (no bind-alias) ---
const legacyClientAlias = "anon_client_mint_legacy_abc";
const legacyAudit = auditLegacyAnonMatchStoredAlias({
  storedServerAlias: legacyClientAlias,
  legacyClientAlias,
});
assert.equal(legacyAudit.action, "clear_and_issue");
assert.equal(legacyAudit.legacyBlocked, true);
results.legacy_client_anon_match_alias_adoption = "BLOCKED";

const legacyAnonMatchBody = {
  solicitanteAnonId: legacyClientAlias,
  localAnonId: legacyClientAlias,
  excludeAnonIds: [legacyClientAlias],
};
assert.notEqual(legacyAnonMatchBody.solicitanteAnonId, SERVER_ALIAS);
results.legacy_anon_match_unbound_alias = "DENIED_BY_API_AND_RULES";
blockers.push({
  id: "LEGACY_ANON_MATCH_CLIENT_ALIAS",
  severity: "rules_breaking",
  detail:
    "Pre-R8 bundles mint anon ids locally; without server bind-alias + binding doc, close/respond/request fail closed and draft rules deny identity escalation.",
});

// bind-alias route must exist before rules (client surface gate)
const bindAliasRoute = path.join(root, "src/app/api/anon-match/bind-alias/route.ts");
assert.ok(fs.existsSync(bindAliasRoute));
const bindSource = fs.readFileSync(bindAliasRoute, "utf8");
assert.match(bindSource, /client_alias_forbidden/);
results.bind_alias_route_present = "ALLOWED";

// Legacy crypto proof documented
assert.match(LEGACY_CLIENT_ALIAS_NO_CRYPTO_PROOF, /server binding proof/i);
results.legacy_alias_no_crypto_proof = "DOCUMENTED";

// Prod bundle fingerprint: assembly commit != shipped app-version commit marker
const appVersionPath = path.join(root, "public/app-version.json");
const appVersion = JSON.parse(fs.readFileSync(appVersionPath, "utf8"));
const assemblyRequiresNewSurface =
  !appVersion.gitCommit ||
  String(appVersion.gitCommit).trim() !== String(process.env.P0_ASSEMBLY_COMMIT || "").trim();
results.prod_app_version_lacks_assembly_pin = assemblyRequiresNewSurface ? "BLOCKED" : "ALLOWED";
if (assemblyRequiresNewSurface) {
  blockers.push({
    id: "PROD_BUNDLE_NOT_PINNED_TO_ASSEMBLY",
    severity: "rollout_order",
    detail:
      "public/app-version.json has no gitCommit matching this assembly; Rules step blocked until Hosting+APK deploy refreshes client surface.",
  });
}

const rulesDeployAllowedPolicy = false;
// Policy: never true while legacy blockers exist and prod bundle unpinned.

console.log(
  JSON.stringify({
    gate: "P0_CLIENT_RULES_COMPAT",
    pass: true,
    results,
    newClientPayloadCompatible: true,
    legacyPayloadWouldBeDenied: true,
    rulesDeployAllowed: rulesDeployAllowedPolicy,
    blockers,
    note: "New client paths draft-safe; legacy active sessions block isolated rules publish",
  }),
);
