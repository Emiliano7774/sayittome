/** Mandatory anon-match alert + competing-request cancellation contract. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const alertSource = read("src/lib/anonMatch/incomingMatchAlert.ts");
const notificationSource = read("src/lib/chat/chatNotifications.ts");
const contextSource = read("src/contexts/AnonMatchContext.tsx");
const serviceSource = read("src/lib/anonMatch/service.ts");

assert.match(alertSource, /playIncomingWhipSound\(\)/);
assert.match(alertSource, /navigator\.vibrate/);
assert.match(alertSource, /showRequiredAnonMatchNotification/);
assert.match(alertSource, /alertAnonMatchChatOpened/);
assert.match(alertSource, /Se encontró un chat/);
assert.match(notificationSource, /ANON_MATCH_CHANNEL_ID/);
assert.match(notificationSource, /showRequiredAnonMatchNotification/);
assert.match(notificationSource, /dismissRequiredAnonMatchNotification/);
assert.match(notificationSource, /NOTIFY_SMALL_ICON = "ic_stat_notify"/);
assert.match(notificationSource, /NOTIFY_LARGE_ICON = "ic_notify_moon"/);
assert.doesNotMatch(notificationSource, /smallIcon:\s*"ic_launcher_foreground"/);
assert.match(contextSource, /dismissIncomingAnonMatchRequestAlert\(id\)/);
assert.match(contextSource, /alertAnonMatchChatOpened\(chatId\)/);
assert.match(contextSource, /setChatViewState\("compact"\)/);
assert.match(serviceSource, /cancelCompetingAnonMatchRequests/);
assert.match(serviceSource, /reason:\s*responderBusy[\s\S]*target_busy/);

const pool = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/matchPool.ts")).href
);
const onlyProfiles = [
  { tipo: "perfil", id: "p1" },
  { tipo: "perfil", id: "p2" },
];
const mixed = [
  { tipo: "perfil", id: "p1" },
  { tipo: "anonimo", id: "anon_live", lastSeenMs: Date.now() },
];
assert.equal(pool.selectMatchCandidateFromPool(onlyProfiles, onlyProfiles)?.tipo, "perfil");
assert.equal(pool.selectMatchCandidateFromPool(mixed, mixed)?.tipo, "anonimo");
assert.equal(pool.selectMatchCandidateFromPool(mixed, mixed)?.id, "anon_live");

const staleAndFresh = [
  { tipo: "anonimo", id: "anon_stale", lastSeenMs: Date.now() - 10 * 60_000 },
  { tipo: "anonimo", id: "anon_fresh", lastSeenMs: Date.now() - 5_000 },
  { tipo: "perfil", id: "p1" },
];
assert.equal(
  pool.selectMatchCandidateFromPool(staleAndFresh, staleAndFresh)?.id,
  "anon_fresh",
);

// Recently contacted target goes to the back of the queue.
const queue = [
  { tipo: "anonimo", id: "anon_a", lastSeenMs: Date.now() },
  { tipo: "anonimo", id: "anon_b", lastSeenMs: Date.now() - 1_000 },
  { tipo: "anonimo", id: "anon_c", lastSeenMs: Date.now() - 2_000 },
];
assert.equal(
  pool.selectMatchCandidateFromPool(queue, queue, Date.now(), ["anon_a"])?.id,
  "anon_b",
);
assert.equal(
  pool.selectMatchCandidateFromPool(queue, queue, Date.now(), ["anon_a", "anon_b"])?.id,
  "anon_c",
);

const typesSrc = fs.readFileSync(
  path.join(root, "src/lib/anonMatch/types.ts"),
  "utf8",
);
assert.match(typesSrc, /ANON_MATCH_REQUEST_MS\s*=\s*45_000/);
assert.match(typesSrc, /ANON_MATCH_PRESENCE_FRESH_MS\s*=\s*3\s*\*\s*60\s*\*\s*1000/);
assert.match(contextSource, /bumpAnonymousPresenceForMatch/);
assert.match(contextSource, /rememberRejectedMatchTarget/);
assert.match(contextSource, /clearRejectedMatchTargets/);

const rejectedTargets = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/rejectedMatchTargets.ts")).href
);
assert.equal(
  rejectedTargets.resolveRejectedMatchTargetKey({
    destinatarioTipo: "anonimo",
    anonId: "anon_x",
  }),
  "anon_x",
);
assert.equal(
  rejectedTargets.resolveRejectedMatchTargetKey({
    destinatarioTipo: "perfil",
    destinatarioUid: "uid_y",
    anonId: "anon_x",
  }),
  "uid_y",
);
assert.deepEqual(rejectedTargets.splitRejectedMatchTargets(["anon_a", "uid_b"]), {
  excludeAnonIds: ["anon_a"],
  excludeUids: ["uid_b"],
});

const service = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/service.ts")).href
);
const request = {
  solicitanteUid: "profile-a",
  solicitanteAnonId: "anon-a",
  destinatarioUid: "profile-b",
  anonId: "anon-b",
};
assert.equal(service.anonMatchRequestInvolvesParticipant(request, "profile-a", ""), true);
assert.equal(service.anonMatchRequestInvolvesParticipant(request, "profile-b", ""), true);
assert.equal(service.anonMatchRequestInvolvesParticipant(request, "", "anon-a"), true);
assert.equal(service.anonMatchRequestInvolvesParticipant(request, "", "anon-b"), true);
assert.equal(service.anonMatchRequestInvolvesParticipant(request, "profile-z", "anon-z"), false);

console.log(JSON.stringify({ gate: "ANON_MATCH_REQUIRED_ALERT", pass: true }, null, 2));
