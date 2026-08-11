/**
 * Story seen persistence + owner-key vs durable viewer.
 * Usage: node --experimental-strip-types scripts/story-seen-persistence.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => pathToFileURL(path.join(root, rel)).href;

const {
  canManageStory,
  resolveStoryOwnerKeyFromState,
  splitMineStoryGroups,
} = await import(src("src/lib/stories/storyOwnerIdentity.ts"));
const { isStoryUnseenForViewer, resetStoryViewedMemoryForTests } = await import(
  src("src/lib/stories/storyViewedCache.ts")
);
const {
  previousSeenStateAllowed,
  planStoryViewAckTransaction,
  viewAckShouldIncrement,
} = await import(src("src/lib/stories/storiesQueryGuard.ts"));
const { selectStoriesForIndex } = await import(
  src("src/lib/stories/selectStoriesForIndex.ts")
);

resetStoryViewedMemoryForTests();

assert.equal(isStoryUnseenForViewer({ id: "s1", viewedBy: { uidA: true } }, ""), false);
assert.equal(isStoryUnseenForViewer({ id: "s1", viewedBy: { uidA: true } }, "uidA"), false);
assert.equal(isStoryUnseenForViewer({ id: "s1", viewedBy: { uidA: true } }, "uidB"), true);
assert.equal(
  isStoryUnseenForViewer({ id: "s1", viewedByAnon: { anon_old: true } }, "anon_old"),
  false,
);
assert.equal(
  isStoryUnseenForViewer({ id: "s1", viewedBy: {}, viewedByAnon: { anon_durable: true } }, "anon_durable"),
  false,
);
assert.equal(
  isStoryUnseenForViewer({ id: "s2", viewedBy: {}, viewedByAnon: {} }, "anon_durable"),
  true,
);

assert.equal(
  resolveStoryOwnerKeyFromState({
    uid: "uid_alice",
    isAnonymous: false,
    authReady: true,
    sessionId: "anon_session",
  }),
  "uid_alice",
);
assert.equal(
  resolveStoryOwnerKeyFromState({
    uid: "firebase_anon",
    isAnonymous: true,
    authReady: true,
    sessionId: "anon_session",
  }),
  "anon_session",
  "owner key is session id, never durable viewer",
);
assert.equal(
  resolveStoryOwnerKeyFromState({
    uid: "",
    isAnonymous: true,
    authReady: false,
    sessionId: "anon_session",
  }),
  "",
);
assert.equal(
  resolveStoryOwnerKeyFromState({
    uid: "",
    isAnonymous: true,
    authReady: true,
    sessionId: "anon_session",
  }),
  "anon_session",
);

const anonStory = {
  ownerUid: "anon_session",
  anonSessionId: "anon_session",
  isAnonymousStory: true,
};
assert.equal(canManageStory(anonStory, "anon_session"), true);
assert.equal(canManageStory(anonStory, "anon_durable"), false);

const { mine } = splitMineStoryGroups(
  [{ ownerUid: "anon_session", stories: [anonStory] }],
  "anon_session",
);
assert.equal(mine.length, 1);
const { mine: notMine } = splitMineStoryGroups(
  [{ ownerUid: "anon_session", stories: [anonStory] }],
  "anon_durable",
);
assert.equal(notMine.length, 0);

assert.equal(
  previousSeenStateAllowed({
    requestViewer: "anon_a",
    storeViewer: "anon_b",
    viewerChanged: true,
  }),
  false,
);
assert.equal(
  viewAckShouldIncrement({ viewerId: "uidA", attempt: 0, alreadySeen: false }),
  true,
);
assert.equal(
  viewAckShouldIncrement({ viewerId: "uidA", attempt: 1, alreadySeen: false }),
  false,
);
const firstAck = planStoryViewAckTransaction({ viewerId: "uidA", remoteViewed: false });
assert.equal(firstAck.apply, true);
assert.equal(firstAck.increment, true);
const secondAck = planStoryViewAckTransaction({ viewerId: "uidA", remoteViewed: true });
assert.equal(secondAck.apply, false);
assert.equal(secondAck.increment, false);

const ackQueue = await import(src("src/lib/stories/storyViewAckQueue.ts"));
ackQueue.resetStoryViewAckQueueForTests();
assert.equal(ackQueue.enqueueStoryViewAck("s1", "uidA").ok, true);
assert.equal(ackQueue.enqueueStoryViewAck("s1", "uidA").items.length, 1, "no duplicate enqueue");
assert.equal(ackQueue.enqueueStoryViewAck("s2", "uidB").items.length, 1);
assert.equal(ackQueue.listStoryViewAckQueue("uidA").map((row) => row.storyId).join(","), "s1");
assert.equal(ackQueue.planAckFailureRecovery(false), "rollback");
assert.equal(ackQueue.planAckFailureRecovery(true), "keep_pending");
ackQueue.retainStoryViewAckQueueForViewer("uidA");
assert.equal(ackQueue.listStoryViewAckQueue("uidB").length, 1, "retain keeps other account pending");
assert.equal(ackQueue.listStoryViewAckQueue("uidA").length, 1);

const selected = selectStoriesForIndex(
  [
    { id: "old", expiresAtMs: 10, createdAtMs: 1 },
    { id: "new", expiresAtMs: 20, createdAtMs: 2 },
  ],
  { limit: 1, now: 1 },
);
assert.equal(selected[0].id, "new");

console.log(JSON.stringify({
  gate: "STORY_SEEN_PERSISTENCE",
  pass: true,
  cases: [
    "pending_not_unseen",
    "two_viewers",
    "durable_anon_seen",
    "owner_key_is_session",
    "can_manage_session_not_durable",
    "ack_idempotent",
    "ack_queue_partition_retry",
  ],
}, null, 2));
