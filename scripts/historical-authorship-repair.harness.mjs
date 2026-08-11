/**
 * Historical assisted repair planner + freeze gate.
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

function resolveMineFromCanonicalSender(input) {
  const viewer = String(input.viewerUid || "").trim();
  const senderAuth = String(input.senderAuthUid || "").trim();
  const role = String(input.senderRole || "").trim();
  const from = String(input.fromUid || "").trim();
  if (viewer && senderAuth && senderAuth === viewer) return true;
  if (role === "profile") return input.isOwnerViewing === true;
  if (role === "anon") {
    if (!input.identityReady) return false;
    if (input.isOwnerViewing) return false;
    return Boolean(input.threadAnonId && from === input.threadAnonId);
  }
  return false;
}

function markFromPerspective(perspective, messageId, mine) {
  const ownerIsAuthor = perspective === "owner" ? mine === true : mine === false;
  return {
    messageId,
    authorRole: ownerIsAuthor ? "profile" : "anon",
    source: "operator",
  };
}

function proposeCanonicalAuthor(identities, authorRole) {
  if (authorRole === "profile") {
    if (!identities.ownerProfileId) return { ok: false, error: "owner_profile_id_missing" };
    return {
      ok: true,
      author: {
        fromUid: profileReplyAuthorId(identities.ownerProfileId),
        senderAuthUid: identities.ownerProfileId,
        senderProfileId: identities.ownerProfileId,
        senderRole: "profile",
        senderKind: "profile",
      },
    };
  }
  if (!String(identities.threadAnonId || "").startsWith("anon_")) {
    return { ok: false, error: "thread_anon_missing" };
  }
  return {
    ok: true,
    author: {
      fromUid: identities.threadAnonId,
      senderAuthUid: "",
      senderProfileId: "",
      senderRole: "anon",
      senderKind: "anon",
    },
  };
}

function mineFor(identities, author, perspective) {
  return resolveMineFromCanonicalSender({
    senderAuthUid: author.senderAuthUid,
    senderRole: author.senderRole,
    fromUid: author.fromUid,
    viewerUid: perspective === "owner" ? identities.ownerProfileId : "",
    isOwnerViewing: perspective === "owner",
    threadAnonId: identities.threadAnonId,
    identityReady: true,
  });
}

const APPLY_FROZEN = true;
function assertApplyAllowed() {
  if (APPLY_FROZEN) throw new Error("APPLY_FROZEN_PENDING_CHATGPT_AUDIT");
}

const OWNER = "ownerUid123";
const THREAD_ANON = "anon_visitor1";
const CHAT = `${THREAD_ANON}__anon_to__alice`;
const identities = {
  chatId: CHAT,
  ownerProfileId: OWNER,
  threadAnonId: THREAD_ANON,
};

const invertedOwner = {
  id: "m1",
  persisted: {
    fromUid: THREAD_ANON,
    senderAuthUid: "",
    senderProfileId: "",
    senderRole: "",
    senderKind: "anon",
  },
};
const correctVisitor = {
  id: "m2",
  persisted: {
    fromUid: THREAD_ANON,
    senderAuthUid: "",
    senderProfileId: "",
    senderRole: "anon",
    senderKind: "anon",
  },
};

assert.deepEqual(markFromPerspective("owner", "m1", true).authorRole, "profile");
assert.deepEqual(markFromPerspective("visitor", "m1", true).authorRole, "anon");
assert.deepEqual(markFromPerspective("visitor", "m1", false).authorRole, "profile");

const proposedOwner = proposeCanonicalAuthor(identities, "profile");
assert.equal(proposedOwner.author.fromUid, profileReplyAuthorId(OWNER));
assert.equal(proposedOwner.author.senderAuthUid, OWNER);
assert.doesNotMatch(JSON.stringify(proposedOwner.author), /targetUid/);

const proposedVisitor = proposeCanonicalAuthor(identities, "anon");
assert.equal(proposedVisitor.author.fromUid, THREAD_ANON);

const afterOwner = {
  owner: mineFor(identities, proposedOwner.author, "owner"),
  visitor: mineFor(identities, proposedOwner.author, "visitor"),
};
assert.deepEqual(afterOwner, { owner: true, visitor: false });

const afterVisitor = {
  owner: mineFor(identities, proposedVisitor.author, "owner"),
  visitor: mineFor(identities, proposedVisitor.author, "visitor"),
};
assert.deepEqual(afterVisitor, { owner: false, visitor: true });

// Repairing m1 as owner must not invert already-correct visitor m2 (unmarked).
const visitorBefore = mineFor(identities, correctVisitor.persisted, "visitor");
const visitorAfterUnmarked = mineFor(identities, correctVisitor.persisted, "visitor");
assert.equal(visitorBefore, true);
assert.equal(visitorAfterUnmarked, true);
const ownerStillNotMineOnVisitorRow = mineFor(
  identities,
  correctVisitor.persisted,
  "owner",
);
assert.equal(ownerStillNotMineOnVisitorRow, false);

// Idempotency: already canonical profile is noop.
const already = proposedOwner.author;
assert.equal(already.senderRole, "profile");
assert.equal(
  already.fromUid === proposedOwner.author.fromUid &&
    already.senderAuthUid === proposedOwner.author.senderAuthUid,
  true,
);

const backup = {
  rows: [
    {
      messageId: "m1",
      before: invertedOwner.persisted,
      after: proposedOwner.author,
    },
  ],
};
const rollback = backup.rows.map((row) => row.before);
assert.deepEqual(rollback[0], invertedOwner.persisted);

assert.throws(() => assertApplyAllowed(), /APPLY_FROZEN_PENDING_CHATGPT_AUDIT/);

const src = fs.readFileSync(
  path.join(root, "src/lib/chat/historicalAuthorshipRepair.ts"),
  "utf8",
);
assert.match(src, /HISTORICAL_REPAIR_APPLY_FROZEN = true/);
assert.doesNotMatch(src, /patchFirestoreDoc|writeBatch|updateDoc/);

const applySrc = fs.readFileSync(
  path.join(root, "src/app/api/admin/authorship-repair/apply/route.ts"),
  "utf8",
);
assert.match(applySrc, /status: 423/);
assert.match(applySrc, /assertHistoricalRepairApplyAllowed/);

const persistSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);
assert.match(persistSrc, /buildCanonicalSender/);

const example = {
  chatIdSuffix: CHAT.slice(-8),
  messageIdShort: "m1",
  before: {
    fromShape: "anon",
    ownerMine: mineFor(identities, invertedOwner.persisted, "owner"),
    visitorMine: mineFor(identities, invertedOwner.persisted, "visitor"),
  },
  after: afterOwner,
  proposed: {
    senderRole: proposedOwner.author.senderRole,
    fromShape: "profile",
  },
};

console.log(
  JSON.stringify(
    {
      gate: "HISTORICAL_AUTHORSHIP_REPAIR",
      pass: true,
      applyFrozen: true,
      examplePreview: example,
    },
    null,
    2,
  ),
);
