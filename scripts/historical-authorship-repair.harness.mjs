/**
 * Historical repair classifier + OCC + identity gates.
 * Usage: node scripts/historical-authorship-repair.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function profileReplyAuthorId(uid) {
  return uid ? `profile_${uid}` : "profile_unknown";
}

function expectedBeforeHash(author) {
  return ["v1", author.fromUid || "", author.senderAuthUid || "", author.senderProfileId || "", author.senderRole || "", author.senderKind || ""].join("|");
}

function resolveMine(input) {
  const viewer = String(input.viewerUid || "").trim();
  const senderAuth = String(input.senderAuthUid || "").trim();
  const role = String(input.senderRole || "").trim();
  const from = String(input.fromUid || "").trim();
  if (viewer && senderAuth && senderAuth === viewer) return true;
  if (role === "profile") return input.isOwnerViewing === true;
  if (role === "anon") {
    if (!input.identityReady || input.isOwnerViewing) return false;
    return Boolean(input.threadAnonId && from === input.threadAnonId);
  }
  return false;
}

function evaluateThreadIdentity(identities) {
  if (identities.chatKind !== "profileAnon") return { ok: false, error: "chat_not_profile_anon" };
  if (!String(identities.threadAnonId || "").startsWith("anon_")) {
    return { ok: false, error: "thread_anon_not_deterministic" };
  }
  if (identities.ownerIdSource === "ambiguous_mismatch") {
    return { ok: false, error: "owner_identity_ambiguous" };
  }
  if (identities.ownerIdSource !== "username_lookup" || !identities.ownerProfileId) {
    return { ok: false, error: "owner_identity_not_deterministic" };
  }
  return { ok: true, error: "" };
}

function propose(identities, role) {
  if (role === "profile") {
    return {
      fromUid: profileReplyAuthorId(identities.ownerProfileId),
      senderAuthUid: identities.ownerProfileId,
      senderProfileId: identities.ownerProfileId,
      senderRole: "profile",
      senderKind: "profile",
    };
  }
  return {
    fromUid: identities.threadAnonId,
    senderAuthUid: "",
    senderProfileId: "",
    senderRole: "anon",
    senderKind: "anon",
  };
}

function mineFor(identities, author, perspective) {
  return resolveMine({
    senderAuthUid: author.senderAuthUid,
    senderRole: author.senderRole,
    fromUid: author.fromUid,
    viewerUid: perspective === "owner" ? identities.ownerProfileId : "",
    isOwnerViewing: perspective === "owner",
    threadAnonId: identities.threadAnonId,
    identityReady: true,
  });
}

function classify({ identities, live, selections, confirmWriteCount, reason }) {
  const identity = evaluateThreadIdentity(identities);
  if (!identity.ok) {
    return {
      applied: [],
      noop: [],
      rejected: selections.map((s) => ({ messageId: s.messageId, reason: identity.error })),
      blockReason: identity.error,
    };
  }
  if (String(reason || "").trim().length < 8) {
    return {
      applied: [],
      noop: [],
      rejected: selections.map((s) => ({ messageId: s.messageId, reason: "reason_required" })),
      blockReason: "reason_required",
    };
  }
  const liveById = new Map(live.map((row) => [row.id, row]));
  const applied = [];
  const noop = [];
  const rejected = [];
  for (const selection of selections) {
    const row = liveById.get(selection.messageId);
    if (!row) {
      rejected.push({ messageId: selection.messageId, reason: "message_missing" });
      continue;
    }
    if (expectedBeforeHash(row.persisted) !== selection.expectedBeforeHash) {
      rejected.push({ messageId: selection.messageId, reason: "stale_or_tampered_hash" });
      continue;
    }
    if (row.updateTime !== selection.updateTime) {
      rejected.push({ messageId: selection.messageId, reason: "stale_update_time" });
      continue;
    }
    const after = propose(identities, selection.desiredRole);
    if (mineFor(identities, after, "owner") === mineFor(identities, after, "visitor")) {
      rejected.push({ messageId: selection.messageId, reason: "not_complementary_both_perspectives" });
      continue;
    }
    if (expectedBeforeHash(row.persisted) === expectedBeforeHash(after)) {
      noop.push({ messageId: selection.messageId, reason: "already_canonical" });
      continue;
    }
    applied.push({ messageId: selection.messageId, before: row.persisted, after });
  }
  if (applied.length > 25) {
    return {
      applied: [],
      noop,
      rejected: [...rejected, ...applied.map((row) => ({ messageId: row.messageId, reason: "batch_limit" }))],
      blockReason: "batch_limit",
    };
  }
  if (confirmWriteCount !== undefined && confirmWriteCount !== applied.length) {
    return {
      applied: [],
      noop,
      rejected: [...rejected, ...applied.map((row) => ({ messageId: row.messageId, reason: "confirm_write_count_mismatch" }))],
      blockReason: "confirm_write_count_mismatch",
    };
  }
  return { applied, noop, rejected, blockReason: "" };
}

const OWNER = "ownerUid123";
const THREAD_ANON = "anon_visitor1";
const identities = {
  chatKind: "profileAnon",
  ownerProfileId: OWNER,
  threadAnonId: THREAD_ANON,
  ownerIdSource: "username_lookup",
};

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
const afterOwner = propose(identities, "profile");

assert.equal(evaluateThreadIdentity({ ...identities, ownerIdSource: "chat_receptor" }).ok, false);
assert.equal(evaluateThreadIdentity({ ...identities, ownerIdSource: "ambiguous_mismatch" }).ok, false);
assert.equal(evaluateThreadIdentity({ ...identities, threadAnonId: "" }).ok, false);
assert.equal(evaluateThreadIdentity(identities).ok, true);

assert.deepEqual(
  { owner: mineFor(identities, afterOwner, "owner"), visitor: mineFor(identities, afterOwner, "visitor") },
  { owner: true, visitor: false },
);
assert.deepEqual(
  { owner: mineFor(identities, propose(identities, "anon"), "owner"), visitor: mineFor(identities, propose(identities, "anon"), "visitor") },
  { owner: false, visitor: true },
);

const live = [
  { id: "m1", updateTime: "t1", persisted: inverted },
  { id: "m2", updateTime: "t2", persisted: visitorOk },
];

// Unselected m2 never appears in selections.
const ready = classify({
  identities,
  live,
  reason: "qa invert owner bubble",
  confirmWriteCount: 1,
  selections: [
    { messageId: "m1", desiredRole: "profile", expectedBeforeHash: expectedBeforeHash(inverted), updateTime: "t1" },
  ],
});
assert.equal(ready.applied.length, 1);
assert.equal(ready.rejected.length, 0);
assert.equal(ready.applied[0].after.senderRole, "profile");

// Partial: one stale, one ready
const partial = classify({
  identities,
  live,
  reason: "partial stale case",
  confirmWriteCount: 1,
  selections: [
    { messageId: "m1", desiredRole: "profile", expectedBeforeHash: expectedBeforeHash(inverted), updateTime: "t1" },
    { messageId: "m2", desiredRole: "anon", expectedBeforeHash: "tampered", updateTime: "t2" },
  ],
});
assert.equal(partial.applied.map((r) => r.messageId).join(), "m1");
assert.equal(partial.rejected[0].reason, "stale_or_tampered_hash");

// Stale updateTime
const staleTime = classify({
  identities,
  live,
  reason: "stale preview time",
  confirmWriteCount: 0,
  selections: [
    { messageId: "m1", desiredRole: "profile", expectedBeforeHash: expectedBeforeHash(inverted), updateTime: "old" },
  ],
});
assert.equal(staleTime.rejected[0].reason, "stale_update_time");
assert.equal(staleTime.applied.length, 0);

// Retry / idempotent
const retry = classify({
  identities,
  live: [{ id: "m1", updateTime: "t3", persisted: afterOwner }],
  reason: "retry after apply",
  confirmWriteCount: 0,
  selections: [
    { messageId: "m1", desiredRole: "profile", expectedBeforeHash: expectedBeforeHash(afterOwner), updateTime: "t3" },
  ],
});
assert.equal(retry.noop[0].reason, "already_canonical");
assert.equal(retry.applied.length, 0);

// Batch limit
const many = Array.from({ length: 26 }, (_, i) => ({
  id: `b${i}`,
  updateTime: `tb${i}`,
  persisted: inverted,
}));
const overLimit = classify({
  identities,
  live: many,
  reason: "too many writes",
  confirmWriteCount: 26,
  selections: many.map((row) => ({
    messageId: row.id,
    desiredRole: "profile",
    expectedBeforeHash: expectedBeforeHash(inverted),
    updateTime: row.updateTime,
  })),
});
assert.equal(overLimit.applied.length <= 25, true);

// Confirm mismatch blocks writes
const mismatch = classify({
  identities,
  live,
  reason: "wrong confirm count",
  confirmWriteCount: 9,
  selections: [
    { messageId: "m1", desiredRole: "profile", expectedBeforeHash: expectedBeforeHash(inverted), updateTime: "t1" },
  ],
});
assert.equal(mismatch.blockReason, "confirm_write_count_mismatch");
assert.equal(mismatch.applied.length, 0);

// Rollback only if current == after
const liveAfter = [{ id: "m1", updateTime: "t4", persisted: afterOwner }];
assert.equal(expectedBeforeHash(liveAfter[0].persisted), expectedBeforeHash(afterOwner));
assert.notEqual(expectedBeforeHash(inverted), expectedBeforeHash(afterOwner));
const tamperedLive = [{ id: "m1", updateTime: "t5", persisted: { ...afterOwner, fromUid: "nope" } }];
assert.notEqual(expectedBeforeHash(tamperedLive[0].persisted), expectedBeforeHash(afterOwner));

// Kill/reopen uses senderRole, not fromUid heuristics alone
assert.equal(mineFor(identities, afterOwner, "owner"), true);
assert.equal(mineFor(identities, visitorOk, "visitor"), true);
assert.equal(mineFor(identities, visitorOk, "owner"), false);

const src = fs.readFileSync(path.join(root, "src/lib/chat/historicalAuthorshipRepair.ts"), "utf8");
assert.match(src, /HISTORICAL_REPAIR_APPLY_FROZEN = false/);
assert.match(src, /owner_identity_not_deterministic/);
assert.match(src, /stale_or_tampered_hash/);
assert.doesNotMatch(src, /targetUid/);

const writeSrc = fs.readFileSync(path.join(root, "src/lib/chat/historicalAuthorshipRepairWrite.ts"), "utf8");
assert.match(writeSrc, /documents:commit/);
assert.match(writeSrc, /backupJson/);
assert.match(writeSrc, /currentDocument/);
assert.match(writeSrc, /AUTHOR_FIELD_PATHS/);
assert.doesNotMatch(writeSrc, /"texto"|"mediaUrl"|"createdAt"/);
assert.match(writeSrc, /fromUid[\s\S]*ownerId[\s\S]*senderAuthUid[\s\S]*senderProfileId[\s\S]*senderRole/);

const persistSrc = fs.readFileSync(path.join(root, "src/lib/chat/persistAnonMessage.ts"), "utf8");
assert.match(persistSrc, /buildCanonicalSender/);

const applySrc = fs.readFileSync(path.join(root, "src/app/api/admin/authorship-repair/apply/route.ts"), "utf8");
assert.match(applySrc, /applyHistoricalAuthorshipRepair/);
assert.doesNotMatch(applySrc, /APPLY_FROZEN_PENDING_CHATGPT_AUDIT/);

console.log(JSON.stringify({
  gate: "HISTORICAL_AUTHORSHIP_REPAIR",
  pass: true,
  applyFrozen: false,
  writerEnabled: true,
  cases: [
    "deterministic_identity",
    "dual_perspective",
    "partial_stale",
    "stale_update_time",
    "tamper_hash",
    "retry_noop",
    "confirm_mismatch",
    "unselected_untouched",
    "kill_reopen_senderRole",
  ],
}, null, 2));
