/**
 * FASE D historical repair safety — imports production modules.
 * Usage: node --experimental-strip-types scripts/historical-repair-safety.harness.mjs
 * Zero real Firestore writes.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.HISTORICAL_REPAIR_EXPORT_SECRET ||= "test-repair-secret";

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

const safety = await import(
  pathToFileURL(path.join(root, "src/lib/chat/historicalRepairSafety.ts")).href
);
const repair = await import(
  pathToFileURL(path.join(root, "src/lib/chat/historicalAuthorshipRepair.ts")).href
);
const writer = await import(
  pathToFileURL(path.join(root, "src/lib/chat/historicalAuthorshipRepairWrite.ts")).href
);

const cases = [];

// --- auth/forbidden (frozen 403 without operator-mark seal) ---
{
  assert.equal(repair.HISTORICAL_REPAIR_APPLY_FROZEN, true);
  const denied = safety.applyFrozenDenial();
  assert.equal(denied.ok, false);
  assert.equal(denied.error, "apply_frozen");
  assert.equal(denied.status, 403);
  assert.equal(denied.writes, 0);
  const http = safety.applyFrozenHttpBody();
  assert.equal(http.error, "apply_frozen");
  assert.equal(http.writes, 0);

  assert.equal(safety.assertOperatorMarksOnlyUnfreeze(null).ok, false);
  assert.equal(
    safety.assertOperatorMarksOnlyUnfreeze({
      composition: "",
      selections: [{ messageId: "m1", desiredRole: "profile", markSource: "operator" }],
    }).error,
    "preview_composition_invalid",
  );
  assert.equal(
    safety.assertOperatorMarksOnlyUnfreeze({
      composition: safety.OPERATOR_MARKS_ONLY_COMPOSITION,
      selections: [{ messageId: "m1", desiredRole: "profile" }],
    }).error,
    "inferred_role_forbidden",
  );
  assert.equal(
    safety.assertOperatorMarksOnlyUnfreeze({
      composition: safety.OPERATOR_MARKS_ONLY_COMPOSITION,
      selections: [],
    }).error,
    "selection_unmarked",
  );

  const applyResult = await writer.applyHistoricalAuthorshipRepair({
    chatId: "anon_x__anon_to__demo",
    selections: [
      {
        messageId: "m1",
        desiredRole: "profile",
        expectedBeforeHash: "v1|a|b|c|d|e",
        updateTime: "t1",
        collectionPath: "chats/anon_x__anon_to__demo/messages/m1",
        collectionName: "messages",
      },
    ],
    reason: "should never write without operator seal",
    confirmWriteCount: 1,
    operatorUid: "op",
    operatorEmail: "admin@example.com",
    previewHash: "deadbeef",
    backend: {
      getRepairById: async () => {
        throw new Error("firestore_touched");
      },
      loadThread: async () => {
        throw new Error("firestore_touched");
      },
      commitApply: async () => {
        throw new Error("firestore_touched");
      },
      commitRollback: async () => {
        throw new Error("firestore_touched");
      },
    },
  });
  assert.equal(applyResult.error, "preview_missing");
  assert.equal(applyResult.writes, 0);

  const rollbackResult = await writer.rollbackHistoricalAuthorshipRepair({
    repairId: "rep_test",
    reason: "should never write legacy non-operator repair",
    operatorUid: "op",
    operatorEmail: "admin@example.com",
    backend: {
      getRepairById: async () => ({
        repairId: "rep_test",
        operationId: "op1",
        status: "applied",
        composition: "",
        chatId: "anon_x__anon_to__demo",
        writeCount: 1,
        backupJson: "[]",
        chatBackupJson: "{}",
        backupDigest: "",
        schemaVersion: 2,
      }),
      loadThread: async () => {
        throw new Error("firestore_touched");
      },
      commitApply: async () => {
        throw new Error("firestore_touched");
      },
      commitRollback: async () => {
        throw new Error("firestore_touched");
      },
    },
  });
  assert.equal(rollbackResult.error, "apply_frozen");
  assert.equal(rollbackResult.status, 403);
  assert.equal(rollbackResult.writes, 0);

  const applyRoute = fs.readFileSync(
    path.join(root, "src/app/api/admin/authorship-repair/apply/route.ts"),
    "utf8",
  );
  const rollbackRoute = fs.readFileSync(
    path.join(root, "src/app/api/admin/authorship-repair/rollback/route.ts"),
    "utf8",
  );
  assert.match(applyRoute, /applyHistoricalAuthorshipRepair/);
  assert.match(rollbackRoute, /rollbackHistoricalAuthorshipRepair/);
  assert.match(applyRoute, /apply_frozen/);
  assert.match(rollbackRoute, /apply_frozen/);
  cases.push("frozen_without_operator_seal");
}

// --- >200 docs without createdAt pagination ---
{
  const total = 250;
  const listed = Array.from({ length: total }, (_, i) => ({
    id: `msg_${String(i).padStart(3, "0")}`,
    createdAt: undefined,
    text: i % 2 === 0 ? "hi" : "",
  }));
  let listCalls = 0;
  let rereadCalls = 0;
  const pages = [listed.slice(0, 200), listed.slice(200)];
  const docs = await safety.paginateFullSubcollection({
    pageSize: 200,
    listPage: async (pageToken) => {
      listCalls += 1;
      const index = pageToken === "p2" ? 1 : 0;
      return {
        docs: pages[index],
        nextPageToken: index === 0 ? "p2" : "",
      };
    },
    rereadByIds: async (ids) => {
      rereadCalls += 1;
      assert.equal(ids.length > 0, true);
      return ids.map((id) => {
        const found = listed.find((row) => row.id === id);
        return { ...found, reread: true };
      });
    },
  });
  assert.equal(docs.length, total);
  assert.equal(listCalls, 2);
  assert.equal(rereadCalls, 2);
  assert.equal(docs.every((doc) => doc.reread === true), true);
  assert.equal(docs.filter((doc) => doc.createdAt == null).length, total);
  assert.equal(safety.shouldIncludeDocMissingCreatedAt(), true);
  const ioSrc = fs.readFileSync(
    path.join(root, "src/lib/chat/historicalAuthorshipRepairIo.ts"),
    "utf8",
  );
  assert.match(ioSrc, /paginateFullSubcollection/);
  assert.match(ioSrc, /rereadMensajesByIds/);
  assert.doesNotMatch(ioSrc, /orderBy\(createdAt\)|fieldPath: "createdAt"/);
  cases.push("paginate_over_200_missing_createdAt");
}

// --- lossless rollback delete/null/absent ---
{
  const DELETE = { __delete: true };
  const original = { fromUid: "anon_keep", senderRole: null };
  const backup = safety.captureDocFields(original, ["fromUid", "senderRole", "senderAuthUid"]);
  assert.equal(backup.fromUid.presence, "present");
  assert.equal(backup.senderRole.presence, "null");
  assert.equal(backup.senderAuthUid.presence, "absent");

  const restored = {};
  safety.restoreDocFields(restored, backup, DELETE);
  assert.equal(restored.fromUid, "anon_keep");
  assert.equal(restored.senderRole, null);
  assert.equal(restored.senderAuthUid, DELETE);

  const target = { fromUid: "changed", senderAuthUid: "invented", extra: 1 };
  safety.restoreBackupField(target, "fromUid", backup.fromUid, DELETE);
  safety.restoreBackupField(target, "senderRole", backup.senderRole, DELETE);
  safety.restoreBackupField(target, "senderAuthUid", backup.senderAuthUid, DELETE);
  assert.equal(target.fromUid, "anon_keep");
  assert.equal(target.senderRole, null);
  assert.equal(target.senderAuthUid, DELETE);
  assert.equal(target.extra, 1);
  cases.push("lossless_rollback_delete_null_absent");
}

// --- retry same operationId ---
{
  const selections = [
    { messageId: "m1", desiredRole: "profile", expectedBeforeHash: "h1" },
  ];
  const operationId = safety.operationIdForApply({
    chatId: "chat_1",
    reason: "retry same plan",
    selections,
  });
  const again = safety.operationIdForApply({
    chatId: "chat_1",
    reason: "retry same plan",
    selections,
  });
  assert.equal(operationId, again);
  const repairId = safety.repairIdForOperationId(operationId);
  const first = safety.resolveIdempotentRepair(null, operationId);
  assert.equal(first.replay, false);
  assert.equal(first.repairId, repairId);
  const retry = safety.resolveIdempotentRepair(
    { repairId, operationId, status: "applied" },
    operationId,
  );
  assert.equal(retry.replay, true);
  assert.equal(retry.repairId, repairId);
  cases.push("retry_same_operationId");
}

// --- noop race (OCC all-or-none includes noops) ---
{
  const expected = {
    identityOk: true,
    identityError: "",
    chatUpdateTime: "chat-t1",
    repairUpdateTime: "",
    messages: [
      { messageId: "m1", updateTime: "t1", beforeHash: "h1", kind: "apply" },
      { messageId: "m2", updateTime: "t2", beforeHash: "h2", kind: "noop" },
    ],
  };
  const ok = safety.evaluateOccAllOrNone(expected, expected);
  assert.equal(ok.ok, true);
  const raced = safety.evaluateOccAllOrNone(expected, {
    ...expected,
    messages: [
      expected.messages[0],
      { ...expected.messages[1], updateTime: "t2-raced" },
    ],
  });
  assert.equal(raced.ok, false);
  assert.equal(raced.error, "noop_race");
  const identityRace = safety.evaluateOccAllOrNone(expected, {
    ...expected,
    identityOk: false,
    identityError: "owner_identity_ambiguous",
  });
  assert.equal(identityRace.ok, false);
  assert.equal(identityRace.error, "owner_identity_ambiguous");
  const chatRace = safety.evaluateOccAllOrNone(expected, {
    ...expected,
    chatUpdateTime: "chat-t2",
  });
  assert.equal(chatRace.error, "chat_update_time_mismatch");
  cases.push("noop_race_occ_all_or_none");
}

// --- chat summary patch condition ---
{
  assert.equal(safety.shouldPatchChatSummary({ latestMessageId: "m9" }, "m9"), true);
  assert.equal(safety.shouldPatchChatSummary({ latestMessageId: "m9" }, "m8"), false);
  assert.equal(safety.shouldPatchChatSummary({ latestMessageId: "" }, "m9"), false);
  const patch = safety.chatSummaryPatchFromAuthor({
    fromUid: "anon_visitor1",
    senderKind: "anon",
    senderRole: "anon",
  });
  assert.equal(patch.lastMessageSender, "anon_visitor1");
  assert.equal(patch.latestSenderKind, "anon");
  assert.equal(patch.latestSenderAnonSessionId, "anon_visitor1");
  const inbox = safety.chatInboxUnreadPatch({
    nextSender: "profile_owner",
    otherPartyId: "anon_visitor1",
    readBy: { profile_owner: false },
    unreadCounts: {},
  });
  assert.equal(inbox.invented, false);
  assert.equal(inbox.readBy, undefined);
  assert.equal(inbox.unreadCounts, undefined);
  cases.push("chat_summary_patch_condition");
}

// --- preview race ---
{
  const selections = [
    {
      messageId: "m1",
      desiredRole: "profile",
      expectedBeforeHash: "h1",
      updateTime: "t1",
    },
  ];
  const stored = safety.hashReviewedPreviewPlan({
    chatId: "chat_1",
    writeCount: 1,
    selections,
  });
  const previewId = safety.previewIdForHash(stored);
  assert.equal(previewId.startsWith("prv_"), true);
  const same = safety.assertReviewedPreviewMatches(stored, stored);
  assert.equal(same.ok, true);
  const raced = safety.hashReviewedPreviewPlan({
    chatId: "chat_1",
    writeCount: 1,
    selections: [{ ...selections[0], updateTime: "t1-new" }],
  });
  const mismatch = safety.assertReviewedPreviewMatches(stored, raced);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, "preview_mismatch");
  cases.push("preview_race");
}

// --- canonical anon keeps existing senderAuthUid; never invents ---
{
  const identities = {
    chatId: "anon_visitor1__anon_to__demo",
    chatKind: "profileAnon",
    threadAnonId: "anon_visitor1",
    ownerProfileId: "ownerUid123",
    ownerUsernameSlug: "demo",
    ownerIdSource: "username_lookup",
  };
  const persisted = {
    fromUid: "anon_visitor1",
    senderAuthUid: "evidence_uid",
    senderProfileId: "",
    senderRole: "",
    senderKind: "anon",
  };
  const proposed = repair.proposeCanonicalAuthor(identities, "anon", persisted);
  assert.equal(proposed.ok, true);
  assert.equal(proposed.author.senderAuthUid, "evidence_uid");
  assert.equal(proposed.author.fromUid, "anon_visitor1");
  const empty = repair.proposeCanonicalAuthor(identities, "anon", {
    ...persisted,
    senderAuthUid: "",
  });
  assert.equal(empty.author.senderAuthUid, "");
  assert.equal(safety.keepExistingAnonSenderAuthUid("kept"), "kept");
  assert.equal(safety.keepExistingAnonSenderAuthUid(""), "");
  cases.push("canonical_anon_keeps_senderAuthUid");
}

// --- duplicates / owner conflicts / schema / backup uniqueness ---
{
  const dup = safety.validateApplySelections([
    { messageId: "m1", desiredRole: "profile", collectionPath: "chats/c/mensajes/m1" },
    { messageId: "m1", desiredRole: "profile", collectionPath: "chats/c/mensajes/m1" },
  ]);
  assert.equal(dup.error, "duplicate_message_id");
  const conflict = safety.validateApplySelections([
    { messageId: "m1", desiredRole: "profile", collectionPath: "chats/c/mensajes/m1" },
    { messageId: "m1", desiredRole: "anon", collectionPath: "chats/c/mensajes/m1" },
  ]);
  assert.equal(conflict.error, "owner_conflict");
  const owner = safety.validateApplySelections(
    [{ messageId: "m1", desiredRole: "profile", collectionPath: "chats/c/mensajes/m1" }],
    { ownerIdSource: "ambiguous_mismatch" },
  );
  assert.equal(owner.error, "owner_identity_ambiguous");
  const schema = safety.validateRepairSchema({
    schemaVersion: 1,
    writeCount: 1,
    backupMessageIds: ["m1"],
  });
  assert.equal(schema.error, "schema_version_mismatch");
  const uniq = safety.validateRepairSchema({
    schemaVersion: 2,
    writeCount: 2,
    backupMessageIds: ["m1", "m1"],
  });
  assert.equal(uniq.error, "backup_not_unique");
  const ok = safety.validateRepairSchema({
    schemaVersion: 2,
    writeCount: 2,
    backupMessageIds: ["m1", "m2"],
  });
  assert.equal(ok.ok, true);
  cases.push("validate_duplicates_owner_schema_backup");
}

// --- export without PII / inventory buckets never auto-assign ---
{
  const exported = safety.exportRepairPlanOpaque({
    applyAllowed: false,
    chatBlocked: false,
    blockReason: "",
    identities: {
      chatId: "anon_visitor1__anon_to__secretuser",
      chatKind: "profileAnon",
      threadAnonId: "anon_visitor1",
      ownerIdSource: "username_lookup",
      ownerProfileId: "ownerUid123",
    },
    selectedCount: 1,
    writeCount: 1,
    noopCount: 0,
    errorCount: 0,
    complementaryFailures: 0,
    inbox: {
      lastMessageId: "msg_abc",
      lastMessageSenderBefore: "anon_visitor1",
      lastMessageSenderAfter: "profile_ownerUid123",
    },
    rows: [
      {
        messageId: "msg_abc",
        selected: true,
        persisted: { fromUid: "anon_visitor1", senderRole: "" },
        proposed: { fromUid: "profile_ownerUid123", senderRole: "profile" },
        expectedBeforeHash: "h",
        updateTime: "t",
        noop: false,
        error: "",
        before: { ownerMine: false, visitorMine: true },
        after: { ownerMine: true, visitorMine: false },
        complementary: true,
      },
    ],
  }, "test-repair-secret");
  const blob = JSON.stringify(exported);
  assert.doesNotMatch(blob, /secretuser/);
  assert.doesNotMatch(blob, /ownerUid123/);
  assert.doesNotMatch(blob, /anon_visitor1/);
  assert.equal(exported.chatOpaqueId.length, 16);
  const buckets = safety.inventoryBucketOnly({
    high: 2,
    medium: 1,
    low: 4,
    ambiguous: 3,
  });
  assert.equal(buckets.autoAssigned, 0);
  assert.equal(buckets.ambiguous, 3);
  assert.equal(
    safety.classifyInventoryConfidence({
      identityOk: false,
      ownerSource: "ambiguous_mismatch",
      missingSenderRole: 9,
      alreadyCanonical: 0,
      messageCount: 9,
    }),
    "ambiguous",
  );
  cases.push("export_no_pii_inventory_buckets");
}

// --- writer is Admin SDK, not REST API-key ---
{
  const writeSrc = fs.readFileSync(
    path.join(root, "src/lib/chat/historicalAuthorshipRepairWrite.ts"),
    "utf8",
  );
  assert.match(writeSrc, /getRepairAdminDb/);
  assert.match(writeSrc, /runTransaction/);
  assert.doesNotMatch(writeSrc, /documents:commit/);
  assert.doesNotMatch(writeSrc, /FIRESTORE_API_KEY/);
  cases.push("admin_sdk_writer_not_rest_key");
}

// --- D9 Admin reads, no REST API key ---
{
  const ioSrc = fs.readFileSync(
    path.join(root, "src/lib/chat/historicalAuthorshipRepairIo.ts"),
    "utf8",
  );
  assert.match(ioSrc, /getRepairAdminDb/);
  assert.doesNotMatch(ioSrc, /FIRESTORE_API_KEY/);
  assert.doesNotMatch(ioSrc, /documents:batchGet/);
  assert.doesNotMatch(ioSrc, /key=\$/);
  assert.match(ioSrc, /messages/);
  assert.match(ioSrc, /compareRepairMessagesChronological/);
  assert.match(ioSrc, /lookupUniqueProfileUidByUsernameAdmin/);
  assert.doesNotMatch(ioSrc, /fetchProfileUidByUsername/);
  cases.push("admin_sdk_reads_not_rest_key");
}

// --- D10 nanos vs ISO must not equate ---
{
  const native = safety.canonicalFirestoreUpdateTime({ seconds: 1700000000, nanoseconds: 123456789 });
  const iso = safety.canonicalFirestoreUpdateTime("2023-11-14T22:13:20.123Z");
  assert.match(native, /1700000000\.123456789/);
  assert.match(iso, /^raw:/);
  assert.notEqual(native, iso);
  const expected = {
    identityOk: true,
    identityError: "",
    chatUpdateTime: native,
    repairUpdateTime: "",
    messages: [{ messageId: "m1", updateTime: native, beforeHash: "h", kind: "apply" }],
  };
  const isoLive = safety.evaluateOccAllOrNone(expected, {
    ...expected,
    messages: [{ messageId: "m1", updateTime: iso, beforeHash: "h", kind: "apply" }],
  });
  assert.equal(isoLive.ok, false);
  assert.equal(isoLive.error, "stale_update_time");
  cases.push("occ_native_nanos_not_iso_millis");
}

// --- D12 raw chat backup + corrupt fail-closed ---
{
  const rawChat = { lastMessageSender: null, type: "anon", extra: 1 };
  const backup = safety.captureDocFields(rawChat, safety.CHAT_SUMMARY_FIELD_KEYS);
  assert.equal(backup.lastMessageSender.presence, "null");
  const ok = safety.parseChatBackupJson(JSON.stringify({ patched: true, fields: backup }));
  assert.equal(ok.ok, true);
  const corrupt = safety.parseChatBackupJson("{not-json");
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.error, "chat_backup_corrupt");
  const badSchema = safety.parseRepairBackupJson("{\"no\":\"array\"}");
  assert.equal(badSchema.ok, false);
  assert.equal(badSchema.error, "backup_corrupt");
  cases.push("chat_raw_backup_corrupt_fail_closed");
}

// --- D13 export has no raw expectedBeforeHash / UIDs ---
{
  const leaked = safety.exportRepairPlanOpaque({
    applyAllowed: false,
    chatBlocked: false,
    blockReason: "",
    identities: {
      chatId: "anon_visitor1__anon_to__secretuser",
      chatKind: "profileAnon",
      threadAnonId: "anon_visitor1",
      ownerIdSource: "username_lookup",
      ownerProfileId: "ownerUid123",
    },
    selectedCount: 1,
    writeCount: 1,
    noopCount: 0,
    errorCount: 0,
    complementaryFailures: 0,
    inbox: {
      lastMessageId: "msg_abc",
      lastMessageSenderBefore: "anon_visitor1",
      lastMessageSenderAfter: "profile_ownerUid123",
    },
    rows: [
      {
        messageId: "msg_abc",
        selected: true,
        persisted: { fromUid: "anon_visitor1", senderRole: "" },
        proposed: { fromUid: "profile_ownerUid123", senderRole: "profile" },
        expectedBeforeHash: "v1|anon_visitor1|ownerUid123|x|y|z",
        updateTime: "t",
        noop: false,
        error: "",
        before: {},
        after: {},
        complementary: true,
      },
    ],
  }, "test-repair-secret");
  const blob = JSON.stringify(leaked);
  assert.doesNotMatch(blob, /expectedBeforeHash/);
  assert.doesNotMatch(blob, /ownerUid123/);
  assert.doesNotMatch(blob, /anon_visitor1/);
  assert.equal(typeof leaked.rows[0].occOpaque, "string");
  cases.push("export_hmac_no_raw_hash");
}

// --- D14 chronological sort including missing createdAt ---
{
  const rows = [
    { id: "z_late", createdAt: "2024-02-01T00:00:00.000Z" },
    { id: "a_missing" },
    { id: "m_mid", createdAt: "2024-01-01T00:00:00.000Z" },
    { id: "b_missing" },
  ];
  const sorted = [...rows].sort(safety.compareRepairMessagesChronological);
  assert.deepEqual(
    sorted.map((row) => row.id),
    ["m_mid", "z_late", "a_missing", "b_missing"],
  );
  const many = Array.from({ length: 210 }, (_, i) => ({
    id: `id_${String(210 - i).padStart(3, "0")}`,
  }));
  const ordered = [...many].sort(safety.compareRepairMessagesChronological);
  assert.equal(ordered[0].id < ordered[ordered.length - 1].id, true);
  assert.equal(ordered.length, 210);
  const withCreateTime = [
    { id: "z", createTime: "2024-02-01T00:00:00.000Z" },
    { id: "m", createTime: "2024-01-01T00:00:00.000Z" },
  ].sort(safety.compareRepairMessagesChronological);
  assert.deepEqual(withCreateTime.map((row) => row.id), ["m", "z"]);
  const tokenEarly = safety.canonicalFirestoreUpdateTime({
    seconds: 1700000000,
    nanoseconds: 123456789,
  });
  assert.equal(tokenEarly, "1700000000.123456789");
  const tokenMid = "1700000050.000000000";
  const isoLate = new Date(1_700_000_100_000).toISOString();
  const mixed = [
    { id: "iso_late", createdAt: isoLate },
    { id: "token_early", createTime: tokenEarly },
    { id: "no_createdAt_mid", createTime: tokenMid },
    { id: "ts_latest", createdAt: { seconds: 1700000200, nanoseconds: 1 } },
  ].sort(safety.compareRepairMessagesChronological);
  assert.deepEqual(
    mixed.map((row) => row.id),
    ["token_early", "no_createdAt_mid", "iso_late", "ts_latest"],
  );
  assert.equal(
    safety.createdAtSortKey(tokenEarly),
    1700000000n * 1_000_000_000n + 123456789n,
  );
  assert.notEqual(safety.createdAtSortKey(tokenEarly), Number(tokenEarly));
  assert.equal(
    safety.createdAtSortKey(tokenEarly) > BigInt(Number.MAX_SAFE_INTEGER),
    true,
  );
  const oneNsLater = [
    { id: "ns0", createTime: "1700000000.000000000" },
    { id: "ns1", createTime: "1700000000.000000001" },
  ].sort(safety.compareRepairMessagesChronological);
  assert.deepEqual(oneNsLater.map((row) => row.id), ["ns0", "ns1"]);
  cases.push("chronological_missing_createdAt_over_200");
}

// --- D15 writer/routes still frozen, 0 writes ---
{
  assert.equal(repair.HISTORICAL_REPAIR_APPLY_FROZEN, true);
  const applyRoute = fs.readFileSync(
    path.join(root, "src/app/api/admin/authorship-repair/apply/route.ts"),
    "utf8",
  );
  const rollbackRoute = fs.readFileSync(
    path.join(root, "src/app/api/admin/authorship-repair/rollback/route.ts"),
    "utf8",
  );
  assert.match(applyRoute, /applyHistoricalAuthorshipRepair/);
  assert.match(rollbackRoute, /rollbackHistoricalAuthorshipRepair/);
  cases.push("writer_routes_imported_frozen");
}

// --- D16 live identity OCC + owner conflicts ---
{
  assert.equal(
    repair.detectOwnerFieldConflicts({
      receptorUid: "owner_a",
      anonOwnerUid: "owner_b",
    }).error,
    "owner_identity_ambiguous",
  );
  const occ = repair.evaluateLiveIdentityOcc({
    chatId: "anon_aaaa__anon_to__maria",
    chatData: { receptorUid: "owner_1", anonOwnerUid: "owner_1" },
    ownerProfile: { id: "owner_1", usernameLower: "maria" },
    ownerLookupUid: "owner_1",
    expected: {
      ownerProfileId: "owner_1",
      ownerUsernameSlug: "maria",
      threadAnonId: "anon_aaaa",
      ownerIdSource: "username_lookup",
    },
  });
  assert.equal(occ.ok, true);
  const raced = repair.evaluateLiveIdentityOcc({
    chatId: "anon_aaaa__anon_to__maria",
    chatData: { receptorUid: "owner_2", anonOwnerUid: "owner_2" },
    ownerProfile: { id: "owner_1", usernameLower: "maria" },
    ownerLookupUid: "owner_1",
    expected: {
      ownerProfileId: "owner_1",
      ownerUsernameSlug: "maria",
      threadAnonId: "anon_aaaa",
      ownerIdSource: "username_lookup",
    },
  });
  assert.equal(raced.ok, false);
  cases.push("identity_occ_same_tx_logic");
}

// --- D18 HMAC secret required ---
{
  const prev = process.env.HISTORICAL_REPAIR_EXPORT_SECRET;
  delete process.env.HISTORICAL_REPAIR_EXPORT_SECRET;
  try {
    assert.throws(() => safety.opaqueExportId("", "x"), /repair_export_secret_required/);
    assert.throws(() => safety.repairExportSecret(), /repair_export_secret_required/);
  } finally {
    process.env.HISTORICAL_REPAIR_EXPORT_SECRET = prev;
  }
  cases.push("hmac_secret_required");
}

// --- D19 schema missing/0 fail-closed ---
{
  assert.equal(
    safety.validateRepairSchema({ schemaVersion: 0, writeCount: 1, backupMessageIds: ["m1"] }).error,
    "schema_version_missing",
  );
  assert.equal(
    safety.validateRepairSchema({ writeCount: 1, backupMessageIds: ["m1"] }).error,
    "schema_version_missing",
  );
  cases.push("schema_missing_not_v2");
}

// --- D20 anon evidence preserved, not forced to thread ---
{
  const identities = {
    chatId: "anon_thread__anon_to__demo",
    chatKind: "profileAnon",
    threadAnonId: "anon_thread",
    ownerProfileId: "ownerUid123",
    ownerUsernameSlug: "demo",
    ownerIdSource: "username_lookup",
  };
  const kept = repair.proposeCanonicalAuthor(identities, "anon", {
    fromUid: "anon_evidence",
    senderAuthUid: "ev",
    senderProfileId: "",
    senderRole: "anon",
    senderKind: "anon",
  });
  assert.equal(kept.ok, true);
  assert.equal(kept.author.fromUid, "anon_evidence");
  const ambiguous = repair.proposeCanonicalAuthor(identities, "anon", {
    fromUid: "AbCdEfGhIjKlMnOpQrStUv",
    senderAuthUid: "",
    senderProfileId: "",
    senderRole: "",
    senderKind: "",
  });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.error, "anon_identity_ambiguous");
  const selected = repair.proposeCanonicalAuthor(
    identities,
    "anon",
    { fromUid: "", senderAuthUid: "", senderProfileId: "", senderRole: "", senderKind: "" },
    "anon_thread",
  );
  assert.equal(selected.author.fromUid, "anon_thread");
  const rejected = repair.proposeCanonicalAuthor(
    identities,
    "anon",
    { fromUid: "", senderAuthUid: "", senderProfileId: "", senderRole: "", senderKind: "" },
    "anon_human",
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "anon_id_not_in_evidence");
  cases.push("anon_not_forced_to_thread");
}

// --- D22 mixed invalid request rejected entirely ---
{
  const identities = {
    chatId: "anon_aaaa__anon_to__demo",
    chatKind: "profileAnon",
    threadAnonId: "anon_aaaa",
    ownerProfileId: "owner_1",
    ownerUsernameSlug: "demo",
    ownerIdSource: "username_lookup",
  };
  const live = [
    {
      id: "m1",
      updateTime: "t1",
      persisted: {
        fromUid: "anon_aaaa",
        senderAuthUid: "",
        senderProfileId: "",
        senderRole: "",
        senderKind: "anon",
      },
    },
    {
      id: "m2",
      updateTime: "t2",
      persisted: {
        fromUid: "anon_aaaa",
        senderAuthUid: "",
        senderProfileId: "",
        senderRole: "",
        senderKind: "anon",
      },
    },
  ];
  const mixed = repair.classifyApplySelections({
    identities,
    live,
    reason: "enough reason text",
    confirmWriteCount: 1,
    selections: [
      {
        messageId: "m1",
        desiredRole: "profile",
        expectedBeforeHash: repair.expectedBeforeHash(live[0].persisted),
        updateTime: "t1",
      },
      {
        messageId: "m2",
        desiredRole: "profile",
        expectedBeforeHash: "tampered",
        updateTime: "t2",
      },
    ],
  });
  assert.equal(mixed.blocked, true);
  assert.equal(mixed.blockReason, "mixed_invalid_request");
  assert.equal(mixed.applied.length, 0);
  assert.equal(mixed.rejected.length, 2);
  const opA = safety.operationIdForApply({
    chatId: "c1",
    reason: "r",
    requestStatus: "apply",
    selections: [{ messageId: "m1", desiredRole: "profile", expectedBeforeHash: "h" }],
  });
  const opB = safety.operationIdForApply({
    chatId: "c1",
    reason: "r",
    requestStatus: "preview",
    selections: [{ messageId: "m1", desiredRole: "profile", expectedBeforeHash: "h" }],
  });
  assert.notEqual(opA, opB);
  cases.push("mixed_request_and_operationId_status");
}

// --- D23 unfrozen fake writer, 0 real calls ---
{
  const applyCore = await import(
    pathToFileURL(path.join(root, "src/lib/chat/historicalAuthorshipRepairApplyCore.ts")).href
  );
  const writerSrc = fs.readFileSync(
    path.join(root, "src/lib/chat/historicalAuthorshipRepairWrite.ts"),
    "utf8",
  );
  const applyRouteSrc = fs.readFileSync(
    path.join(root, "src/app/api/admin/authorship-repair/apply/route.ts"),
    "utf8",
  );
  const rollbackRouteSrc = fs.readFileSync(
    path.join(root, "src/app/api/admin/authorship-repair/rollback/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(writerSrc, /allowUnfrozenTest/);
  assert.match(writerSrc, /OPERATOR_MARKS_ONLY_COMPOSITION|operator_marks_only/);
  assert.match(
    fs.readFileSync(path.join(root, "src/lib/chat/historicalAuthorshipRepairApplyCore.ts"), "utf8"),
    /assertOperatorMarksOnlyUnfreeze/,
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, "src/lib/chat/historicalAuthorshipRepairApplyCore.ts"), "utf8"),
    /from ["']firebase-admin|getRepairAdminDb|await defaultBackend/,
  );

  assert.equal(repair.HISTORICAL_REPAIR_APPLY_FROZEN, true);
  let commits = 0;
  const identities = {
    chatId: "anon_aaaa__anon_to__demo",
    chatKind: "profileAnon",
    threadAnonId: "anon_aaaa",
    ownerProfileId: "owner_1",
    ownerUsernameSlug: "demo",
    ownerIdSource: "username_lookup",
  };
  const persisted = {
    fromUid: "anon_aaaa",
    senderAuthUid: "",
    senderProfileId: "",
    senderRole: "",
    senderKind: "anon",
  };
  const after = repair.proposeCanonicalAuthor(identities, "profile", persisted);
  const applySelections = [
    {
      messageId: "m1",
      desiredRole: "profile",
      expectedBeforeHash: repair.expectedBeforeHash(persisted),
      updateTime: "t1",
      collectionName: "messages",
      collectionPath: "chats/anon_aaaa__anon_to__demo/messages/m1",
      selectedAnonId: "",
      before: persisted,
      after: after.author,
    },
  ];
  const previewHash = safety.hashReviewedPreviewPlan({
    chatId: identities.chatId,
    writeCount: 1,
    selections: applySelections,
  });
  // Negative: sealed without markSource → still frozen
  const sealedBare = safety.sealReviewedPreview({
    previewId: "prv_bare",
    previewHash,
    chatId: identities.chatId,
    selections: applySelections,
  });
  assert.notEqual(sealedBare.composition, safety.OPERATOR_MARKS_ONLY_COMPOSITION);

  const previewStore = new Map([["prv_bare", sealedBare]]);
  const fake = {
    getRepairById: async () => null,
    getPreview: async (id) => previewStore.get(String(id || "")) || null,
    loadThread: async () => ({
      identities,
      messages: [{
        id: "m1",
        updateTime: "t1",
        persisted,
        collectionName: "messages",
        collectionPath: "chats/anon_aaaa__anon_to__demo/messages/m1",
      }],
      chat: { latestMessageId: "m1", updateTime: "chat-t", exists: true },
      messageDocs: {
        "chats/anon_aaaa__anon_to__demo/messages/m1": {
          collectionName: "messages",
          fromUid: "anon_aaaa",
        },
      },
    }),
    commitApply: async (plan) => {
      commits += 1;
      assert.equal(plan.composition, safety.OPERATOR_MARKS_ONLY_COMPOSITION);
      assert.equal(plan.applied[0].collectionName, "messages");
      assert.equal(plan.applied[0].collectionPath, "chats/anon_aaaa__anon_to__demo/messages/m1");
      assert.equal(Object.prototype.hasOwnProperty.call(plan.chatPatch, "readBy"), false);
    },
    commitRollback: async () => {
      commits += 1;
    },
  };
  // Bare seal (no markSource) is present in store → composition gate → apply_frozen.
  // Missing seal (no store entry) remains preview_missing — see frozen_without_operator_seal.
  const frozen = await writer.applyHistoricalAuthorshipRepair({
    chatId: identities.chatId,
    selections: applySelections,
    reason: "bare seal must stay frozen",
    confirmWriteCount: 1,
    operatorUid: "op",
    operatorEmail: "op@example.com",
    previewId: "prv_bare",
    previewHash,
    sealedPreview: sealedBare,
    backend: fake,
  });
  assert.equal(frozen.error, "apply_frozen");
  assert.equal(commits, 0);

  // Positive: operator_marks_only seal unfreezes apply
  const operatorSelections = applySelections.map((row) => ({
    ...row,
    markSource: "operator",
  }));
  const operatorHash = safety.hashReviewedPreviewPlan({
    chatId: identities.chatId,
    writeCount: 1,
    selections: operatorSelections,
  });
  const sealedOperator = safety.sealReviewedPreview({
    previewId: "prv_op",
    previewHash: operatorHash,
    chatId: identities.chatId,
    selections: operatorSelections,
    identities: {
      ownerProfileId: identities.ownerProfileId,
      ownerUsernameSlug: identities.ownerUsernameSlug,
      threadAnonId: identities.threadAnonId,
      ownerIdSource: identities.ownerIdSource,
    },
  });
  previewStore.set("prv_op", sealedOperator);
  assert.equal(sealedOperator.composition, safety.OPERATOR_MARKS_ONLY_COMPOSITION);
  const unfrozen = await writer.applyHistoricalAuthorshipRepair({
    chatId: identities.chatId,
    selections: operatorSelections,
    reason: "operator mark unfreeze apply ok",
    confirmWriteCount: 1,
    operatorUid: "op",
    operatorEmail: "op@example.com",
    previewId: "prv_op",
    previewHash: operatorHash,
    sealedPreview: sealedOperator,
    backend: fake,
  });
  assert.equal(unfrozen.error, "");
  assert.equal(unfrozen.ok, true);
  assert.equal(commits, 1);

  const rolled = await writer.rollbackHistoricalAuthorshipRepair({
    repairId: "rep_x",
    operatorUid: "op",
    operatorEmail: "op@example.com",
    reason: "operator mark unfreeze rollback",
    backend: {
      ...fake,
      getRepairById: async () => ({
        repairId: "rep_x",
        operationId: "opx",
        status: "applied",
        composition: safety.OPERATOR_MARKS_ONLY_COMPOSITION,
        chatId: identities.chatId,
        writeCount: 1,
        schemaVersion: 2,
        backupJson: JSON.stringify([{
          messageId: "m1",
          before: persisted,
          after: after.author,
          collectionPath: "chats/anon_aaaa__anon_to__demo/messages/m1",
          collectionName: "messages",
          fields: {},
        }]),
        chatBackupJson: JSON.stringify({
          patched: false,
          fields: {},
          afterPatch: {},
          latestMessageId: "m1",
          writeCount: 1,
        }),
        backupDigest: safety.computeBackupDigest({
          writeCount: 1,
          backupJson: JSON.stringify([{
            messageId: "m1",
            before: persisted,
            after: after.author,
            collectionPath: "chats/anon_aaaa__anon_to__demo/messages/m1",
            collectionName: "messages",
            fields: {},
          }]),
          chatBackupJson: JSON.stringify({
            patched: false,
            fields: {},
            afterPatch: {},
            latestMessageId: "m1",
            writeCount: 1,
          }),
        }),
      }),
    },
  });
  // May fail integrity/shape — at least must not be apply_frozen
  assert.notEqual(rolled.error, "apply_frozen");
  cases.push("operator_marks_only_unfreeze");

  const summaryGate = safety.rollbackSummaryGate({
    liveLatestMessageId: "m2",
    plannedLatestMessageId: "m1",
    liveSummary: { lastMessageSender: "x" },
    afterPatch: { lastMessageSender: "x" },
  });
  assert.equal(summaryGate.error, "new_message_before_rollback");
  cases.push("unfrozen_fake_writer_zero_real_calls");

  const missingOwner = repair.evaluateLiveIdentityOcc({
    chatId: identities.chatId,
    chatData: {},
    ownerProfile: null,
    expected: identities,
  });
  assert.equal(missingOwner.error, "owner_doc_missing");
  const missingLookup = repair.evaluateLiveIdentityOcc({
    chatId: identities.chatId,
    chatData: {},
    ownerProfile: { id: "owner_1", usernameLower: "demo" },
    ownerLookupUid: "",
    expected: identities,
  });
  assert.equal(missingLookup.error, "username_lookup_missing");
  assert.equal(safety.parseRepairBackupJson("not-json").error, "backup_corrupt");
  assert.equal(safety.parseRepairBackupJson(JSON.stringify([{ extra: 1, messageId: "m1" }])).error, "backup_extra_key");
  assert.equal(
    safety.parseRepairBackupJson(JSON.stringify([{ messageId: "" }])).error,
    "backup_before_missing",
  );
  assert.equal(
    safety.parseRepairBackupJson(JSON.stringify([{
      messageId: "m1",
      before: {},
      after: {},
      fields: {},
      updateTime: "t1",
      collectionPath: "chats/x/otros/m1",
    }])).error,
    "backup_path_invalid",
  );
  const collision = repair.classifyApplySelections({
    identities,
    live: [
      { id: "same", updateTime: "t1", persisted, collectionName: "mensajes", collectionPath: "chats/c/mensajes/same" },
      { id: "same", updateTime: "t1", persisted, collectionName: "messages", collectionPath: "chats/c/messages/same" },
    ],
    reason: "enough reason text",
    confirmWriteCount: 1,
    selections: [
      {
        messageId: "same",
        desiredRole: "profile",
        expectedBeforeHash: repair.expectedBeforeHash(persisted),
        updateTime: "t1",
      },
    ],
  });
  assert.equal(collision.blocked, true);
  assert.equal(collision.rejected[0].reason, "ambiguous_collection");
  const noCommit = await applyCore.runApplyHistoricalRepair({
    chatId: identities.chatId,
    selections: operatorSelections,
    reason: "unfrozen fake apply",
    confirmWriteCount: 1,
    operatorUid: "op",
    operatorEmail: "op@example.com",
    previewHash: operatorHash,
    backend: fake,
  });
  assert.equal(noCommit.ok, false);
  assert.equal(noCommit.error, "preview_missing");
  assert.equal(noCommit.writes, 0);
  const beforeConflict = commits;
  const opConflict = await applyCore.runApplyHistoricalRepair({
    chatId: identities.chatId,
    selections: operatorSelections,
    reason: "unfrozen fake apply",
    confirmWriteCount: 1,
    operatorUid: "op",
    operatorEmail: "op@example.com",
    previewId: "prv_op",
    previewHash: operatorHash,
    sealedPreview: sealedOperator,
    operationId: "deadbeef",
    backend: fake,
  });
  assert.equal(opConflict.error, "operation_id_conflict");
  assert.equal(opConflict.writes, 0);
  assert.equal(commits, beforeConflict);
  cases.push("hist_p0_negative_zero_commits");

  const missingChat = repair.evaluateLiveIdentityOcc({
    chatId: identities.chatId,
    chatData: { receptorUid: "owner_1" },
    chatExists: false,
    ownerProfile: { id: "owner_1", usernameLower: "demo" },
    ownerLookupUid: "owner_1",
    expected: identities,
  });
  assert.equal(missingChat.error, "chat_doc_missing");

  const authorFields = Object.fromEntries(
    safety.AUTHOR_BACKUP_KEYS.map((key) => [
      key,
      { presence: "absent", type: "undefined" },
    ]),
  );
  assert.equal(
    safety.parseRepairBackupJson(JSON.stringify([{
      messageId: "m1",
      before: { fromUid: "anon_a" },
      after: { fromUid: "profile_x" },
      fields: { ...authorFields, texto: { presence: "present", type: "string", raw: "hola" } },
      updateTime: "t1",
      collectionPath: "chats/c/mensajes/m1",
    }])).error,
    "backup_extra_key",
  );
  assert.equal(
    safety.parseChatBackupJson(JSON.stringify({
      patched: true,
      fields: {
        ...Object.fromEntries(
          safety.CHAT_SUMMARY_FIELD_KEYS.map((key) => [
            key,
            { presence: "absent", type: "undefined" },
          ]),
        ),
        receptorUid: { presence: "present", type: "string", raw: "uid" },
      },
    })).error,
    "chat_backup_extra_key",
  );
  assert.equal(
    safety.parseRepairBackupJson(JSON.stringify([{
      messageId: "m1",
      after: { fromUid: "x" },
      fields: authorFields,
      updateTime: "t1",
      collectionPath: "chats/c/mensajes/m1",
    }])).error,
    "backup_before_missing",
  );
  assert.equal(
    safety.parseRepairBackupJson(JSON.stringify([{
      messageId: "m1",
      before: { fromUid: "x" },
      after: { fromUid: "y" },
      fields: authorFields,
      collectionPath: "chats/c/mensajes/m1",
    }])).error,
    "backup_updateTime_missing",
  );
  assert.equal(
    safety.parseRepairBackupJson(JSON.stringify([{
      messageId: "m1",
      before: { fromUid: "x" },
      after: { fromUid: "y" },
      updateTime: "t1",
      collectionPath: "chats/c/mensajes/m1",
    }])).error,
    "backup_fields_missing",
  );
  assert.equal(
    safety.parseRepairBackupJson(JSON.stringify([{
      messageId: "m1",
      before: { fromUid: "x" },
      after: { fromUid: "y" },
      fields: {
        ...authorFields,
        fromUid: { presence: "present", type: "string", raw: null },
      },
      updateTime: "t1",
      collectionPath: "chats/c/mensajes/m1",
    }])).error,
    "backup_field_invalid",
  );
  const validRow = {
    messageId: "m1",
    before: { fromUid: "anon_a" },
    after: { fromUid: "profile_x" },
    fields: authorFields,
    updateTime: "t1",
    collectionPath: "chats/c/mensajes/m1",
  };
  const fullBackup = JSON.stringify([validRow, { ...validRow, messageId: "m2", collectionPath: "chats/c/mensajes/m2" }]);
  const digest = safety.computeBackupDigest({ writeCount: 2, backupJson: fullBackup });
  const truncated = safety.verifyBackupIntegrity({
    writeCount: 2,
    backupJson: JSON.stringify([validRow]),
    digest,
  });
  assert.equal(truncated.ok, false);
  assert.ok(["backup_truncated", "backup_digest_mismatch"].includes(truncated.error));

  const listed = [
    { id: "same", collectionName: "mensajes", collectionPath: "chats/c/mensajes/same", body: "es" },
  ];
  const reread = new Map([
    ["chats/c/messages/same", { id: "same", collectionName: "messages", collectionPath: "chats/c/messages/same", body: "en" }],
  ]);
  const merged = safety.mergeListedWithReread(listed, reread);
  assert.equal(merged[0].body, "es");
  const latestAmbiguous = safety.resolveLatestMessageRef("c", "same", [
    { id: "same", collectionPath: "chats/c/mensajes/same", collectionName: "mensajes" },
    { id: "same", collectionPath: "chats/c/messages/same", collectionName: "messages" },
  ]);
  assert.equal(latestAmbiguous.error, "latest_message_ambiguous");

  const rolledConflict = safety.resolveIdempotentRepair(
    { repairId: "rep_x", operationId: "op", status: "rolled_back" },
    "op",
  );
  assert.equal(rolledConflict.error, "operation_status_conflict");
  assert.equal(rolledConflict.replay, false);
  const failedConflict = safety.resolveIdempotentRepair(
    { repairId: "rep_x", operationId: "op", status: "failed" },
    "op",
  );
  assert.equal(failedConflict.error, "operation_status_conflict");
  const replayApplied = safety.resolveIdempotentRepair(
    { repairId: "rep_x", operationId: "op", status: "applied" },
    "op",
  );
  assert.equal(replayApplied.replay, true);

  const replayOp = safety.operationIdForApply({
    chatId: identities.chatId,
    reason: "unfrozen fake apply",
    requestStatus: "apply",
    previewId: "prv_op",
    previewHash: operatorHash,
    operatorUid: "op",
    confirmWriteCount: 1,
    identity: sealedOperator.identities,
    selections: operatorSelections.map((row) => ({
      ...row,
      afterHash: repair.expectedBeforeHash(after.author),
    })),
  });
  const replayBackend = {
    ...fake,
    getRepairById: async () => ({
      repairId: `rep_${replayOp.slice(0, 32)}`,
      operationId: replayOp,
      status: "applied",
      writeCount: 1,
      applied: [{ messageId: "m1", status: "applied", reason: "ready" }],
    }),
  };
  const replayed = await applyCore.runApplyHistoricalRepair({
    chatId: identities.chatId,
    selections: operatorSelections,
    reason: "unfrozen fake apply",
    confirmWriteCount: 1,
    operatorUid: "op",
    operatorEmail: "op@example.com",
    previewId: "prv_op",
    previewHash: operatorHash,
    sealedPreview: sealedOperator,
    backend: replayBackend,
  });
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.ok, true);
  assert.equal(commits, beforeConflict);

  const staleAnon = await applyCore.runApplyHistoricalRepair({
    chatId: identities.chatId,
    selections: [{ ...operatorSelections[0], selectedAnonId: "anon_other" }],
    reason: "unfrozen fake apply",
    confirmWriteCount: 1,
    operatorUid: "op",
    operatorEmail: "op@example.com",
    previewId: "prv_op",
    previewHash: operatorHash,
    sealedPreview: sealedOperator,
    backend: fake,
  });
  assert.equal(staleAnon.ok, false);
  assert.equal(staleAnon.writes, 0);

  const arbitraryAnon = repair.resolveAnonRepairFromUid(
    persisted,
    "anon_random_not_in_evidence",
    identities,
  );
  assert.equal(arbitraryAnon.error, "anon_id_not_in_evidence");
  cases.push("hist_reaud9_d16_d19_d21_d22_d23");
}

console.log(JSON.stringify({
  gate: "HISTORICAL_REPAIR_SAFETY",
  pass: true,
  applyFrozen: true,
  writes: 0,
  cases,
}, null, 2));
