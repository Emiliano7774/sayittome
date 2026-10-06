/**
 * Anon-match presence must publish under the SERVER alias that incoming listeners watch.
 * Usage: node --experimental-strip-types scripts/anon-match-presence-alias.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const identity = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/anonymousPresenceIdentity.ts")).href
);
const consumer = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/anonMatchConsumer.ts")).href
);

const presenceSrc = fs.readFileSync(
  path.join(root, "src/services/anonymousPresence.ts"),
  "utf8",
);
const routeSrc = fs.readFileSync(
  path.join(root, "src/app/api/anonymous-presence/route.ts"),
  "utf8",
);
const contextSrc = fs.readFileSync(
  path.join(root, "src/contexts/AnonMatchContext.tsx"),
  "utf8",
);
const poolSrc = fs.readFileSync(
  path.join(root, "src/lib/anonMatch/matchPool.ts"),
  "utf8",
);
const serviceSrc = fs.readFileSync(
  path.join(root, "src/lib/anonMatch/service.ts"),
  "utf8",
);

const covers = [];
const SERVER_ALIAS = "anon_serverIssued_xyz_m1";
const LOCAL_LEGACY = "anon_localmint_abc_m1";
const PROFILE_UID = "profile_uid_delivery_1";

// 1) Presence anonymous uses server alias, not getAnonSessionId for publish.
assert.match(presenceSrc, /resolveAnonMatchSessionId|getStoredAnonMatchAlias/);
assert.match(presenceSrc, /resolveAnonPresenceDocId/);
assert.doesNotMatch(
  presenceSrc,
  /writeAnonymousPresence[\s\S]{0,400}getAnonSessionId\(\)/,
);
assert.match(presenceSrc, /shouldPublishAnonMatchPresence/);
covers.push("presence_uses_server_alias");

// 2) Registered profile does NOT publish anon presence.
assert.equal(
  identity.shouldPublishAnonMatchPresence("registered_profile"),
  false,
);
assert.equal(
  identity.shouldPublishAnonMatchPresence("anonymous_firebase"),
  true,
);
assert.match(presenceSrc, /onAuthStateChanged/);
assert.match(presenceSrc, /isAnonymous/);
covers.push("registered_no_ghost_presence");

// 3) API verifies caller + alias ownership; spoof denied.
assert.match(routeSrc, /verifyAnonMatchCaller/);
assert.match(routeSrc, /decideAnonymousPresenceWrite/);
assert.match(routeSrc, /lookupActiveAnonMatchAliasForAuth/);
assert.match(routeSrc, /setAnonMatchAdminDoc/);
assert.match(routeSrc, /deleteAnonMatchAdminDoc/);

const spoof = identity.decideAnonymousPresenceWrite({
  callerIsAnonymous: true,
  boundServerAlias: SERVER_ALIAS,
  claimedAnonId: LOCAL_LEGACY,
});
assert.equal(spoof.ok, false);
assert.equal(spoof.reason, "alias_spoof");

const profileDenied = identity.decideAnonymousPresenceWrite({
  callerIsAnonymous: false,
  boundServerAlias: SERVER_ALIAS,
});
assert.equal(profileDenied.ok, false);

const ownOk = identity.decideAnonymousPresenceWrite({
  callerIsAnonymous: true,
  boundServerAlias: SERVER_ALIAS,
  claimedAnonId: SERVER_ALIAS,
});
assert.equal(ownOk.ok, true);
assert.equal(ownOk.anonId, SERVER_ALIAS);
covers.push("api_alias_ownership");

// 4) Presence doc id == incoming listener anonId.
const presenceDocId = identity.resolveAnonPresenceDocId({
  serverAnonAlias: SERVER_ALIAS,
  localAnonSessionId: LOCAL_LEGACY,
});
assert.equal(presenceDocId, SERVER_ALIAS);
assert.equal(
  identity.resolveAnonPresenceDocId({
    serverAnonAlias: "",
    localAnonSessionId: LOCAL_LEGACY,
  }),
  "",
);

const incomingAnon = consumer.resolveIncomingListenerTargets({
  callerKind: "anonymous_firebase",
  registeredUid: "",
  serverAnonAlias: SERVER_ALIAS,
});
assert.equal(incomingAnon.anonDestinatarioId, SERVER_ALIAS);
assert.equal(presenceDocId, incomingAnon.anonDestinatarioId);
covers.push("presence_id_equals_listener");

// 5) Simulated profile -> anon delivery identity chain.
const poolPickedAnonId = SERVER_ALIAS; // matchPool uses anonId || id from anonimos_activos
const requestTargetAnonId = poolPickedAnonId;
const receiverListens = consumer.resolveIncomingListenerTargets({
  callerKind: "anonymous_firebase",
  registeredUid: "",
  serverAnonAlias: SERVER_ALIAS,
}).anonDestinatarioId;
assert.equal(requestTargetAnonId, receiverListens);
covers.push("profile_to_anon_delivery");

// 6) Simulated anon -> profile delivery identity chain.
const incomingProfile = consumer.resolveIncomingListenerTargets({
  callerKind: "registered_profile",
  registeredUid: PROFILE_UID,
  serverAnonAlias: "",
});
assert.equal(incomingProfile.profileDestinatarioUid, PROFILE_UID);
assert.equal(incomingProfile.anonDestinatarioId, undefined);
covers.push("anon_to_profile_delivery");

// 7) Both-searching race: competing cancel + pending exclusion (no infinite deadlock).
assert.match(serviceSrc, /cancelCompetingAnonMatchRequests/);
assert.match(serviceSrc, /invalidateAnonMatchAvailabilityCache/);
assert.match(poolSrc, /pendingAnonIds|listPendingMatchTargets/);
assert.match(poolSrc, /busyAnonIds|listBusyDirectChatParticipants/);
covers.push("both_searching_no_deadlock");

// 8) retry <=5s and >1s.
const retryMatch = contextSrc.match(/RETRY_DELAY_MS\s*=\s*([\d_]+)/);
assert.ok(retryMatch, "RETRY_DELAY_MS missing");
const retryMs = Number(String(retryMatch[1]).replace(/_/g, ""));
assert.ok(retryMs > 1_000 && retryMs <= 5_000, `retryMs=${retryMs}`);
covers.push("retry_3_to_5s");

// Waiting clears retry timer (no keep retrying after candidate).
assert.match(contextSrc, /setPhase\("waiting"\)[\s\S]{0,220}clearRetryTimer\(\)/);
covers.push("waiting_stops_retry");
assert.match(contextSrc, /rememberRecentMatchTarget/);
covers.push("recent_target_goes_last");

// 9) Profile rows may cache; anonimos_activos must always re-read (live matching).
assert.match(poolSrc, /MATCH_POOL_CACHE_MS\s*=\s*2\s*\*\s*60_000/);
assert.match(poolSrc, /Always re-read live anon presence|Always re-read anonimos_activos/);
assert.match(poolSrc, /where:\s*\{\s*field:\s*"source",\s*value:\s*"anon_match_presence"/);
assert.match(poolSrc, /invalidateAnonMatchAvailabilityCache[\s\S]*poolCache\s*=\s*null/);
assert.match(
  fs.readFileSync(path.join(root, "src/app/api/anonymous-presence/route.ts"), "utf8"),
  /invalidateAnonMatchAvailabilityCache/,
);
// Prefer live anons over idle profiles so incoming alerts actually fire.
assert.match(poolSrc, /selectMatchCandidateFromPool/);
assert.match(poolSrc, /ANON_MATCH_PRESENCE_FRESH_MS/);
assert.match(poolSrc, /freshAnonPool/);
assert.match(contextSrc, /rememberRejectedMatchTarget/);
assert.match(contextSrc, /clearRejectedMatchTargets/);
covers.push("pool_cache_2m");
covers.push("anon_presence_always_fresh");
covers.push("prefer_live_anons_for_incoming");
covers.push("reject_until_chat_close");

// 10) Old local session id cannot spoof presence.
const foreignCleanup = identity.decideLegacyAnonPresenceCleanup({
  callerIsAnonymous: true,
  callerUid: "auth_a",
  legacyLocalAnonId: SERVER_ALIAS,
  boundAuthUidForLegacy: "auth_other",
});
assert.equal(foreignCleanup.ok, false);
assert.equal(foreignCleanup.reason, "foreign_alias");

const unownedLegacyCleanup = identity.decideLegacyAnonPresenceCleanup({
  callerIsAnonymous: true,
  callerUid: "auth_a",
  legacyLocalAnonId: LOCAL_LEGACY,
  boundAuthUidForLegacy: null,
});
assert.equal(unownedLegacyCleanup.ok, false);
assert.equal(unownedLegacyCleanup.reason, "unowned_legacy");

const ownBoundCleanup = identity.decideLegacyAnonPresenceCleanup({
  callerIsAnonymous: true,
  callerUid: "auth_a",
  legacyLocalAnonId: LOCAL_LEGACY,
  boundAuthUidForLegacy: "auth_a",
});
assert.equal(ownBoundCleanup.ok, true);

assert.match(routeSrc, /alias_spoof|decideAnonymousPresenceWrite/);
assert.doesNotMatch(routeSrc, /safeId\(body\?\.anonId\)/);
covers.push("local_id_cannot_spoof");

assert.equal(
  identity.isVerifiedAnonMatchPresence({
    id: SERVER_ALIAS,
    anonId: SERVER_ALIAS,
    source: "anon_match_presence",
    authUid: "auth_a",
  }),
  true,
);
assert.equal(
  identity.isVerifiedAnonMatchPresence({
    id: LOCAL_LEGACY,
    anonId: LOCAL_LEGACY,
    source: "",
    authUid: "",
  }),
  false,
);
assert.match(poolSrc, /isVerifiedAnonMatchPresence/);
covers.push("legacy_ghost_presence_excluded");

// Snapshot error callbacks present (silent failures were a delivery risk).
assert.match(contextSrc, /incoming listener error|anon incoming listener error/);
assert.match(contextSrc, /onSnapshot\([\s\S]*?,\s*\(error\)\s*=>/);
covers.push("snapshot_onError");

// Active window 15m, heartbeat 90s.
assert.equal(identity.ANON_PRESENCE_ACTIVE_MS, 15 * 60 * 1000);
assert.equal(identity.ANON_PRESENCE_HEARTBEAT_MS, 90_000);
covers.push("active_window_15m");

// Open tabs must stay online: pagehide discard must not DELETE presence.
assert.doesNotMatch(
  presenceSrc,
  /addEventListener\(\s*["']pagehide["'][\s\S]{0,200}removeAnonymousPresence/,
);
assert.match(presenceSrc, /alias_spoof|missing_server_alias/);
assert.match(presenceSrc, /AbortSignal\.timeout/);
assert.match(routeSrc, /stale body claim|auth-bound alias/);
covers.push("open_tab_presence_survives_pagehide");

const shuffleSrc = fs.readFileSync(
  path.join(root, "src/app/api/shuffle/route.ts"),
  "utf8",
);
assert.match(shuffleSrc, /ANON_PRESENCE_ACTIVE_MS/);
assert.doesNotMatch(shuffleSrc, /const ANON_ACTIVE_MS = 90 \* 1000/);
covers.push("shuffle_visitor_ttl_matches_presence");

console.log(
  JSON.stringify({
    gate: "ANON_MATCH_PRESENCE_ALIAS",
    pass: true,
    covers,
    retryMs,
  }),
);
