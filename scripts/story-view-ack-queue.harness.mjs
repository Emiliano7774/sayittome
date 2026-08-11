/**
 * Durable ACK queue isolated by viewer. Imports production storyViewAckQueue.
 * Usage: node --experimental-strip-types scripts/story-view-ack-queue.harness.mjs
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
const queue = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storyViewAckQueue.ts")).href
);
const guard = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storiesQueryGuard.ts")).href
);

queue.resetStoryViewAckQueueForTests();
queue.resetAckFlushFlightsForTests();
queue.enqueueStoryViewAck("s1", "viewer_a");
queue.enqueueStoryViewAck("s2", "viewer_b");
assert.equal(queue.listStoryViewAckQueue("viewer_a").length, 1);
assert.equal(queue.listStoryViewAckQueue("viewer_b").length, 1);
queue.retainStoryViewAckQueueForViewer("viewer_a");
assert.equal(queue.listStoryViewAckQueue("viewer_b").length, 1, "isolate/retain keeps other partitions");
assert.equal(queue.listStoryViewAckQueue("viewer_a").length, 1);
assert.equal(queue.planAckFailureRecovery(true), "keep_pending");
assert.equal(queue.planAckFailureRecovery(false), "rollback");

const ackCore = await import(
  pathToFileURL(path.join(root, "src/lib/stories/ackStoryViewCore.ts")).href
);

queue.resetStoryViewAckQueueForTests();
queue.enqueueStoryViewAck("s_commit", "viewer_a");
const fakeTx = {
  updates: 0,
  get: async () => ({
    exists: () => true,
    data: () => ({ viewCount: 0 }),
  }),
  update() {
    this.updates += 1;
  },
};
let callbackRuns = 0;

async function rejectAfterRetries(_db, callback) {
  callbackRuns += 1;
  await callback(fakeTx);
  callbackRuns += 1;
  await callback(fakeTx);
  throw new Error("commit_failed");
}

queue.resetStoryViewAckQueueForTests();
queue.enqueueStoryViewAck("s_commit", "viewer_a");
callbackRuns = 0;
try {
  await ackCore.ackStoryViewWithRunner(
    "s_commit",
    "viewer_a",
    rejectAfterRetries,
    { path: "historias/s_commit" },
  );
  assert.fail("commit should reject");
} catch (error) {
  assert.equal(String(error.message || error), "commit_failed");
}
assert.equal(callbackRuns, 2);
assert.equal(queue.listStoryViewAckQueue("viewer_a").length, 1, "pending remains after failed commit");

callbackRuns = 0;
const successAfterRetries = async (_db, callback) => {
  callbackRuns += 1;
  await callback(fakeTx);
  callbackRuns += 1;
  const result = await callback(fakeTx);
  return result;
};
const committed = await ackCore.ackStoryViewWithRunner(
  "s_commit",
  "viewer_a",
  successAfterRetries,
  { path: "historias/s_commit" },
);
assert.equal(committed.wrote, true);
assert.equal(callbackRuns, 2);
assert.equal(queue.listStoryViewAckQueue("viewer_a").length, 0, "single dequeue post-commit");

queue.resetStoryViewAckQueueForTests();
queue.resetAckFlushFlightsForTests();
queue.enqueueStoryViewAck("sA", "viewer_a");
queue.enqueueStoryViewAck("sB", "viewer_b");
let releaseA;
const seen = [];
const ackA = new Promise((resolve) => {
  releaseA = resolve;
});
const ackOne = (storyId, viewerId) => {
  seen.push(`${viewerId}:${storyId}`);
  if (viewerId === "viewer_a") return ackA;
  return Promise.resolve({ wrote: true });
};
const flushA = queue.schedulePartitionedAckFlush("viewer_a", ackOne);
const flushB = queue.schedulePartitionedAckFlush("viewer_b", ackOne);
assert.notEqual(flushA, flushB, "single-flight is per viewer");
await flushB;
assert.ok(seen.includes("viewer_b:sB"));
assert.equal(seen.includes("viewer_a:sA"), true);
releaseA({ wrote: true });
await flushA;
assert.ok(seen.includes("viewer_a:sA"));
assert.ok(seen.includes("viewer_b:sB"));

queue.resetStoryViewAckQueueForTests();
queue.enqueueStoryViewAck("sA", "viewer_a");
queue.retainStoryViewAckQueueForViewer("viewer_b");
assert.equal(queue.listStoryViewAckQueue("viewer_a").length, 1, "logout/login does not drop A");

queue.resetStoryViewAckQueueForTests();
queue.enqueueStoryViewAck("gone", "viewer_a");
const missingTx = {
  get: async () => ({ exists: () => false, data: () => ({}) }),
  update() {
    throw new Error("update_inside_missing_tx");
  },
};
const missing = await ackCore.ackStoryViewWithRunner(
  "gone",
  "viewer_a",
  async (_db, callback) => callback(missingTx),
);
assert.equal(missing.missing, true);
assert.equal(queue.listStoryViewAckQueue("viewer_a").length, 0, "missing doc cleans after resolve");

assert.deepEqual(
  guard.resolveNextPlayTarget({
    viewerId: "",
    currentOwnerUid: "o1",
    currentIndex: 0,
    currentStories: [{ id: "s1" }, { id: "s2" }],
    groups: [],
    isUnseen: () => true,
    groupIsUnseen: () => true,
  }),
  { kind: "same-group", group: null, storyIndex: 0 },
);

console.log("pass story_view_ack_queue");
