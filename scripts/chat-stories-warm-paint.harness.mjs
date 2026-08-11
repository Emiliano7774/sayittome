/**
 * Chat warm cache is chatId-keyed; Stories snapshot is viewer-isolated.
 * Usage: node --experimental-strip-types scripts/chat-stories-warm-paint.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => pathToFileURL(path.join(root, rel)).href;

const {
  writeCachedChatMessages,
  readCachedChatMessages,
  clearCachedChatMessages,
} = await import(src("src/lib/chat/chatMessageCache.ts"));
const {
  previousSeenStateAllowed,
  shouldSkipStoriesRefresh,
  buildStoriesSnapshotWrite,
  pickLatestStoriesSnapshot,
} = await import(src("src/lib/stories/storiesQueryGuard.ts"));

clearCachedChatMessages();
writeCachedChatMessages("chat_1", [{ id: "m1", text: "hi" }]);
assert.equal(readCachedChatMessages("chat_1")?.[0]?.id, "m1");
assert.equal(readCachedChatMessages("chat_missing"), null);

assert.equal(
  previousSeenStateAllowed({
    requestViewer: "viewer_a",
    storeViewer: "viewer_a",
    viewerChanged: false,
  }),
  true,
);
assert.equal(
  previousSeenStateAllowed({
    requestViewer: "viewer_a",
    storeViewer: "viewer_b",
    viewerChanged: true,
  }),
  false,
);

assert.equal(
  shouldSkipStoriesRefresh({
    force: false,
    viewerChanged: false,
    now: 10_000,
    lastFetch: 1_000,
    ttlMs: 10 * 60_000,
    hasMaterialized: true,
  }),
  true,
);
assert.equal(
  shouldSkipStoriesRefresh({
    force: false,
    viewerChanged: true,
    now: 10_000,
    lastFetch: 1_000,
    ttlMs: 10 * 60_000,
    hasMaterialized: true,
  }),
  false,
);

const now = Date.now();
const snapA = buildStoriesSnapshotWrite({
  viewerUid: "viewer_a",
  groups: [{ ownerUid: "owner_1" }],
  previous: null,
  source: "network",
  now,
});
assert.equal(snapA.viewerUid, "viewer_a");
assert.equal(snapA.groups.length, 1);
const snapB = buildStoriesSnapshotWrite({
  viewerUid: "viewer_b",
  groups: [{ ownerUid: "owner_2" }],
  previous: snapA,
  source: "network",
  now,
});
assert.equal(snapB.viewerUid, "viewer_b");
assert.notEqual(snapB.viewerUid, snapA.viewerUid);

const warmStarted = Date.now();
const warmSnap = buildStoriesSnapshotWrite({
  viewerUid: "viewer_a",
  groups: [{ ownerUid: "owner_1", stories: [{ id: "s1" }] }],
  previous: null,
  source: "network",
  now,
});
const latest = pickLatestStoriesSnapshot([warmSnap, null], now);
const warmMs = Date.now() - warmStarted;
assert.equal(latest?.groups.length, 1);
assert.ok(warmMs < 50, `warm snapshot paint too slow: ${warmMs}ms`);
const blank = pickLatestStoriesSnapshot([null, null], now);
assert.equal(blank, null);

console.log(JSON.stringify({
  gate: "CHAT_STORIES_WARM_PAINT",
  pass: true,
  warmMs,
  blank: blank === null,
}, null, 2));
