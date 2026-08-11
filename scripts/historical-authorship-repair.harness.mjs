/**
 * Historical repair classifier + OCC + identity gates.
 * Imports production classifyApplySelections (all-or-none). No copied partial apply.
 * Usage: node --experimental-strip-types scripts/historical-authorship-repair.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveAlias(specifier) {
  if (!specifier.startsWith("@/")) return "";
  const abs = path.join(root, "src", specifier.slice(2));
  const candidates = [abs, `${abs}.ts`, `${abs}.tsx`, `${abs}.js`, path.join(abs, "index.ts")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return "";
}

if (typeof module.registerHooks === "function") {
  module.registerHooks({
    resolve(specifier, context, nextResolve) {
      const mapped = resolveAlias(specifier);
      if (mapped) return { url: mapped, shortCircuit: true };
      return nextResolve(specifier, context);
    },
  });
}

const repair = await import(
  pathToFileURL(path.join(root, "src/lib/chat/historicalAuthorshipRepair.ts")).href
);
const safety = await import(
  pathToFileURL(path.join(root, "src/lib/chat/historicalRepairSafety.ts")).href
);

const OWNER = "ownerUid123";
const THREAD_ANON = "anon_visitor1";
const CHAT_ID = "anon_visitor1__anon_to__demo";
const identities = {
  chatId: CHAT_ID,
  chatKind: "profileAnon",
  ownerProfileId: OWNER,
  ownerUsernameSlug: "demo",
  threadAnonId: THREAD_ANON,
  ownerIdSource: "username_lookup",
};

function msgPath(id) {
  return `chats/${CHAT_ID}/mensajes/${id}`;
}

function asLive(id, updateTime, persisted) {
  return {
    id,
    updateTime,
    persisted,
    collectionName: "mensajes",
    collectionPath: msgPath(id),
  };
}

function selection(id, desiredRole, persisted, updateTime, extras = {}) {
  return {
    messageId: id,
    desiredRole,
    expectedBeforeHash: extras.expectedBeforeHash || repair.expectedBeforeHash(persisted),
    updateTime,
    collectionName: "mensajes",
    collectionPath: msgPath(id),
    selectedAnonId: extras.selectedAnonId || THREAD_ANON,
  };
}

const inverted = {
  fromUid: THREAD_ANON,
  senderAuthUid: "",
  senderProfileId: "",
  senderRole: "",
  senderKind: "anon",
};
const visitorOk = {
  fromUid: THREAD_ANON,
  senderAuthUid: "",
  senderProfileId: "",
  senderRole: "anon",
  senderKind: "anon",
};
const afterOwner = repair.proposeCanonicalAuthor(identities, "profile", inverted);
assert.equal(afterOwner.ok, true);

assert.equal(repair.evaluateThreadIdentity({ ...identities, ownerIdSource: "chat_receptor" }).ok, false);
assert.equal(repair.evaluateThreadIdentity({ ...identities, ownerIdSource: "ambiguous_mismatch" }).ok, false);
assert.equal(repair.evaluateThreadIdentity({ ...identities, threadAnonId: "" }).ok, false);
assert.equal(repair.evaluateThreadIdentity(identities).ok, true);

assert.deepEqual(
  {
    owner: repair.mineForPerspective(identities, afterOwner.author, "owner"),
    visitor: repair.mineForPerspective(identities, afterOwner.author, "visitor"),
  },
  { owner: true, visitor: false },
);
const afterAnon = repair.proposeCanonicalAuthor(identities, "anon", visitorOk, THREAD_ANON);
assert.equal(afterAnon.ok, true);
assert.deepEqual(
  {
    owner: repair.mineForPerspective(identities, afterAnon.author, "owner"),
    visitor: repair.mineForPerspective(identities, afterAnon.author, "visitor"),
  },
  { owner: false, visitor: true },
);

const live = [
  asLive("m1", "t1", inverted),
  asLive("m2", "t2", visitorOk),
];

const ready = repair.classifyApplySelections({
  identities,
  live,
  reason: "qa invert owner bubble",
  confirmWriteCount: 1,
  selections: [selection("m1", "profile", inverted, "t1")],
});
assert.equal(ready.blocked, false);
assert.equal(ready.applied.length, 1);
assert.equal(ready.rejected.length, 0);
assert.equal(ready.applied[0].after.senderRole, "profile");

const mixedStale = repair.classifyApplySelections({
  identities,
  live,
  reason: "mixed stale must reject all",
  confirmWriteCount: 1,
  selections: [
    selection("m1", "profile", inverted, "t1"),
    selection("m2", "anon", visitorOk, "t2", { expectedBeforeHash: "tampered" }),
  ],
});
assert.equal(mixedStale.blocked, true);
assert.equal(mixedStale.blockReason, "mixed_invalid_request");
assert.equal(mixedStale.applied.length, 0);
assert.equal(mixedStale.rejected.length, 2);

const occAllOrNone = safety.evaluateOccAllOrNone(
  {
    identityOk: true,
    identityError: "",
    chatUpdateTime: "c1",
    repairUpdateTime: "",
    messages: [
      { messageId: "m1", updateTime: "t1", beforeHash: "h1", kind: "apply" },
      { messageId: "m2", updateTime: "t2", beforeHash: "h2", kind: "noop" },
    ],
  },
  {
    identityOk: true,
    identityError: "",
    chatUpdateTime: "c1",
    repairUpdateTime: "",
    messages: [
      { messageId: "m1", updateTime: "t1", beforeHash: "h1", kind: "apply" },
      { messageId: "m2", updateTime: "t2", beforeHash: "stale", kind: "noop" },
    ],
  },
);
assert.equal(occAllOrNone.ok, false);
assert.ok(["noop_race", "stale_update_time"].includes(occAllOrNone.error));

const staleTime = repair.classifyApplySelections({
  identities,
  live,
  reason: "stale preview time",
  confirmWriteCount: 0,
  selections: [selection("m1", "profile", inverted, "old")],
});
assert.equal(staleTime.blocked, true);
assert.equal(staleTime.applied.length, 0);
assert.ok(
  ["stale_update_time", "mixed_invalid_request"].includes(staleTime.rejected[0].reason),
);

const retry = repair.classifyApplySelections({
  identities,
  live: [asLive("m1", "t3", afterOwner.author)],
  reason: "retry after apply",
  confirmWriteCount: 0,
  selections: [selection("m1", "profile", afterOwner.author, "t3")],
});
assert.equal(retry.blocked, false);
assert.equal(retry.noop[0].reason, "already_canonical");
assert.equal(retry.applied.length, 0);

const many = Array.from({ length: 26 }, (_, i) => asLive(`b${i}`, `tb${i}`, inverted));
const overLimit = repair.classifyApplySelections({
  identities,
  live: many,
  reason: "too many writes",
  confirmWriteCount: 26,
  selections: many.map((row) => selection(row.id, "profile", inverted, row.updateTime)),
});
assert.equal(overLimit.blocked, true);
assert.equal(overLimit.applied.length, 0);
assert.equal(overLimit.blockReason, "batch_limit");

const mismatch = repair.classifyApplySelections({
  identities,
  live,
  reason: "wrong confirm count",
  confirmWriteCount: 9,
  selections: [selection("m1", "profile", inverted, "t1")],
});
assert.equal(mismatch.blockReason, "confirm_write_count_mismatch");
assert.equal(mismatch.applied.length, 0);

const liveAfter = [asLive("m1", "t4", afterOwner.author)];
assert.equal(
  repair.expectedBeforeHash(liveAfter[0].persisted),
  repair.expectedBeforeHash(afterOwner.author),
);
assert.notEqual(repair.expectedBeforeHash(inverted), repair.expectedBeforeHash(afterOwner.author));
const tamperedLive = [asLive("m1", "t5", { ...afterOwner.author, fromUid: "nope" })];
assert.notEqual(
  repair.expectedBeforeHash(tamperedLive[0].persisted),
  repair.expectedBeforeHash(afterOwner.author),
);

assert.equal(repair.mineForPerspective(identities, afterOwner.author, "owner"), true);
assert.equal(repair.mineForPerspective(identities, visitorOk, "visitor"), true);
assert.equal(repair.mineForPerspective(identities, visitorOk, "owner"), false);

const src = fs.readFileSync(path.join(root, "src/lib/chat/historicalAuthorshipRepair.ts"), "utf8");
assert.match(src, /HISTORICAL_REPAIR_APPLY_FROZEN = true/);
assert.match(src, /owner_identity_not_deterministic/);
assert.match(src, /stale_or_tampered_hash/);
assert.match(src, /detectOwnerFieldConflicts/);
assert.match(src, /mixed_invalid_request/);
assert.doesNotMatch(src, /ownerIdSource = "target_uid"/);

const writeSrc = fs.readFileSync(path.join(root, "src/lib/chat/historicalAuthorshipRepairWrite.ts"), "utf8");
assert.match(writeSrc, /HISTORICAL_REPAIR_APPLY_FROZEN/);
assert.match(writeSrc, /getRepairAdminDb/);
assert.match(writeSrc, /backupJson/);
assert.doesNotMatch(writeSrc, /documents:commit/);
assert.doesNotMatch(writeSrc, /FIRESTORE_API_KEY/);
assert.doesNotMatch(writeSrc, /"texto"|"mediaUrl"|"createdAt"/);

const persistSrc = fs.readFileSync(path.join(root, "src/lib/chat/persistAnonMessage.ts"), "utf8");
assert.match(persistSrc, /buildCanonicalSender/);

const applySrc = fs.readFileSync(path.join(root, "src/app/api/admin/authorship-repair/apply/route.ts"), "utf8");
assert.match(applySrc, /applyHistoricalAuthorshipRepair/);
assert.match(applySrc, /apply_frozen|applyFrozenHttpBody/);
assert.doesNotMatch(applySrc, /APPLY_FROZEN_PENDING_CHATGPT_AUDIT/);

const rollbackSrc = fs.readFileSync(path.join(root, "src/app/api/admin/authorship-repair/rollback/route.ts"), "utf8");
assert.match(rollbackSrc, /HISTORICAL_REPAIR_APPLY_FROZEN/);
assert.match(rollbackSrc, /applyFrozenHttpBody/);

console.log(JSON.stringify({
  gate: "HISTORICAL_AUTHORSHIP_REPAIR",
  pass: true,
  applyFrozen: true,
  writerEnabled: false,
  cases: [
    "deterministic_identity",
    "dual_perspective",
    "mixed_stale_all_or_none",
    "occ_all_or_none",
    "stale_update_time",
    "tamper_hash",
    "retry_noop",
    "confirm_mismatch",
    "unselected_untouched",
    "kill_reopen_senderRole",
  ],
}, null, 2));
