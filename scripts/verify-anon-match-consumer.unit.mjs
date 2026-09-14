/**
 * R8 consumer — caller kind must distinguish registered profile vs Firebase anonymous.
 * Usage: node --experimental-strip-types scripts/verify-anon-match-consumer.unit.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const consumerUrl = pathToFileURL(
  path.join(root, "src/lib/anonMatch/anonMatchConsumer.ts"),
).href;

const {
  resolveAnonMatchCallerKind,
  buildAnonMatchRequestBody,
  buildAnonMatchCloseBody,
  buildAnonMatchRespondBody,
  resolveIncomingListenerTargets,
  resolveActiveChatDiscoveryTargets,
  resolveAcceptedChatRole,
} = await import(consumerUrl);

const PROFILE_UID = "registered_profile_uid";
const ANON_AUTH_UID = "firebase_anonymous_auth_uid";
const SERVER_ALIAS = "anon_server_issued_r8";

const results = {};

const profileUser = { uid: PROFILE_UID, isAnonymous: false };
const anonFirebaseUser = { uid: ANON_AUTH_UID, isAnonymous: true };

assert.equal(resolveAnonMatchCallerKind(profileUser), "registered_profile");
assert.equal(resolveAnonMatchCallerKind(anonFirebaseUser), "anonymous_firebase");
assert.equal(resolveAnonMatchCallerKind(null), "unauthenticated");
results.profile_vs_anonymous_kind = "ALLOWED";

const profileRequest = buildAnonMatchRequestBody({
  callerKind: "registered_profile",
  registeredUid: PROFILE_UID,
  serverAnonAlias: "",
});
assert.deepEqual(profileRequest, {
  localAnonId: "",
  excludeAnonIds: [],
  excludeUids: [PROFILE_UID],
});
assert.equal("solicitanteAnonId" in profileRequest, false);
results.profile_request_body = "ALLOWED";

const anonRequest = buildAnonMatchRequestBody({
  callerKind: "anonymous_firebase",
  registeredUid: "",
  serverAnonAlias: SERVER_ALIAS,
});
assert.equal(anonRequest.solicitanteAnonId, SERVER_ALIAS);
assert.equal(anonRequest.localAnonId, SERVER_ALIAS);
assert.deepEqual(anonRequest.excludeAnonIds, [SERVER_ALIAS]);
assert.equal("excludeUids" in anonRequest, false);
results.anonymous_request_body = "ALLOWED";

assert.equal(resolveAcceptedChatRole("registered_profile"), "perfil");
assert.equal(resolveAcceptedChatRole("anonymous_firebase"), "anonimo");
results.accepted_chat_role = "ALLOWED";

const profileDiscovery = resolveActiveChatDiscoveryTargets({
  callerKind: "registered_profile",
  registeredUid: PROFILE_UID,
  serverAnonAlias: "",
});
assert.equal(profileDiscovery.mode, "profile");
assert.equal(profileDiscovery.registeredUid, PROFILE_UID);
results.profile_discovery_targets = "ALLOWED";

const anonDiscovery = resolveActiveChatDiscoveryTargets({
  callerKind: "anonymous_firebase",
  registeredUid: "",
  serverAnonAlias: SERVER_ALIAS,
});
assert.equal(anonDiscovery.mode, "anonymous");
assert.equal(anonDiscovery.anonId, SERVER_ALIAS);
results.anonymous_discovery_targets = "ALLOWED";

const profileIncoming = resolveIncomingListenerTargets({
  callerKind: "registered_profile",
  registeredUid: PROFILE_UID,
  serverAnonAlias: "",
});
assert.equal(profileIncoming.profileDestinatarioUid, PROFILE_UID);
assert.equal(profileIncoming.anonDestinatarioId, undefined);
results.profile_incoming_listener = "ALLOWED";

const anonIncoming = resolveIncomingListenerTargets({
  callerKind: "anonymous_firebase",
  registeredUid: "",
  serverAnonAlias: SERVER_ALIAS,
});
assert.equal(anonIncoming.anonDestinatarioId, SERVER_ALIAS);
assert.equal(anonIncoming.profileDestinatarioUid, undefined);
results.anonymous_incoming_listener = "ALLOWED";

const profileClose = buildAnonMatchCloseBody({
  chatId: "chat_1",
  role: "perfil",
  registeredUid: PROFILE_UID,
  serverAnonAlias: SERVER_ALIAS,
});
assert.equal(profileClose.closedBy, PROFILE_UID);
results.profile_close_body = "ALLOWED";

const anonClose = buildAnonMatchCloseBody({
  chatId: "chat_2",
  role: "anonimo",
  registeredUid: PROFILE_UID,
  serverAnonAlias: SERVER_ALIAS,
});
assert.equal(anonClose.closedBy, SERVER_ALIAS);
results.anonymous_close_body = "ALLOWED";

const profileRespond = buildAnonMatchRespondBody({
  solicitudId: "sol_1",
  accept: true,
  receiverRole: "perfil",
  registeredUid: PROFILE_UID,
  serverAnonAlias: SERVER_ALIAS,
});
assert.deepEqual(profileRespond, { solicitudId: "sol_1", accept: true });
results.profile_respond_body = "ALLOWED";

const anonRespond = buildAnonMatchRespondBody({
  solicitudId: "sol_2",
  accept: false,
  receiverRole: "anonimo",
  registeredUid: "",
  serverAnonAlias: SERVER_ALIAS,
});
assert.deepEqual(anonRespond, {
  solicitudId: "sol_2",
  accept: false,
  anonId: SERVER_ALIAS,
});
results.anonymous_respond_body = "ALLOWED";

// Regression: Firebase anonymous must use anonymous request body (solicitanteAnonId), not profile branch.
const anonKind = resolveAnonMatchCallerKind(anonFirebaseUser);
assert.equal(anonKind, "anonymous_firebase");
const anonBodyFromKind = buildAnonMatchRequestBody({
  callerKind: anonKind,
  registeredUid: "",
  serverAnonAlias: SERVER_ALIAS,
});
assert.equal(anonBodyFromKind.solicitanteAnonId, SERVER_ALIAS);
results.firebase_anonymous_not_profile_branch = "ALLOWED";

console.log(
  JSON.stringify({
    gate: "VERIFY_ANON_MATCH_CONSUMER",
    pass: true,
    results,
    note: "Registered profile vs Firebase anonymous caller classification",
  }),
);
