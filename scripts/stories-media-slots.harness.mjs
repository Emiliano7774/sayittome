/**
 * Stories C7/C8: stable A/B slots + duration by storyId + useful-paint.
 *
 * Usage: node --experimental-strip-types scripts/stories-media-slots.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const slots = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storyMediaSlots.ts")).href
);
const guard = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storiesQueryGuard.ts")).href
);

const a = slots.mediaSlotFromStory({ id: "s1", mediaUrl: "u1", mediaType: "image" });
const b = slots.mediaSlotFromStory({ id: "s2", mediaUrl: "u2", mediaType: "video" });
a.ready = true;
const promoted = slots.planMediaSlotPromotion({
  active: "a",
  currentId: "s2",
  slots: { a, b },
});
assert.equal(promoted.promoted, true);
assert.equal(promoted.active, "b");
assert.equal(slots.otherMediaSlot("b"), "a");

assert.equal(slots.videoDurationMsFromMetadata(6.2), 6200);
assert.equal(
  slots.shouldPersistVideoDuration({ storyId: "s2", durationMs: 6200, writtenForId: "" }),
  true,
);
assert.equal(
  slots.shouldPersistVideoDuration({ storyId: "s2", durationMs: 6200, writtenForId: "s2" }),
  false,
);
assert.equal(
  slots.shouldPersistVideoDuration({ storyId: "s3", durationMs: 6200, writtenForId: "s2" }),
  true,
);

assert.equal(guard.isStoryViewerUsefulPaint({ current: { id: "s1", mediaUrl: "u" } }), false);
assert.equal(
  guard.isStoryViewerUsefulPaint({ current: { id: "s1", mediaUrl: "u" }, frontReady: true }),
  true,
);
assert.equal(
  guard.isStoryViewerUsefulPaint({ current: { id: "s1", texto: "hola" }, frontReady: false }),
  true,
);
assert.equal(guard.isStoryViewerUsefulPaint({ current: null }), false);
assert.equal(
  guard.isStoryViewerUsefulPaint({
    current: { id: "s1", mediaUrl: "u" },
    frontReady: true,
    errored: true,
  }),
  false,
  "onError is not useful-paint",
);

const hiddenMeta = {
  slotId: "b",
  storyId: "s2",
  mediaUrl: "u2",
  durationSec: 8,
  readyState: 1,
  visible: false,
};
assert.equal(
  slots.acceptMediaSlotEvent(hiddenMeta, { storyId: "s1", mediaUrl: "u1" }),
  false,
  "stale hidden metadata rejected for current",
);
assert.equal(
  slots.acceptMediaSlotEvent(hiddenMeta, { storyId: "s2", mediaUrl: "u2", slotId: "b" }),
  true,
  "hidden loadedmetadata counts for that story",
);
assert.equal(
  slots.acceptMediaSlotEvent(
    { ...hiddenMeta, visible: true },
    { storyId: "s2", mediaUrl: "u2", slotId: "b" },
  ),
  true,
);
assert.equal(slots.durationFromPromotedElement({ duration: 8.2, readyState: 4 }), 8.2);
assert.equal(slots.mediaSlotDomKey("a"), "slot-a");
assert.equal(slots.mediaSlotDomKey("b"), "slot-b");
assert.equal(slots.promotedSlotKeepsNode("a", "b", "b"), true);

let mediaSlots = {
  a: slots.mediaSlotFromStory({ id: "old", mediaUrl: "old-url", mediaType: "image" }),
  b: slots.emptyMediaSlot(),
};
mediaSlots = {
  a: slots.mediaSlotFromStory({ id: "new", mediaUrl: "new-url", mediaType: "image" }),
  b: slots.emptyMediaSlot(),
};
const staleReady = slots.applyMediaSlotMutation(
  mediaSlots,
  { slotId: "a", storyId: "old", mediaUrl: "old-url" },
  { ready: true, errored: true, durationSec: 9 },
);
assert.equal(staleReady.a.ready, false, "old-url after swap does not mark new ready");
assert.equal(staleReady.a.errored, false, "old-url after swap does not mark new error");
assert.equal(staleReady.a.durationSec, 0, "old-url after swap does not set new duration");
const freshReady = slots.applyMediaSlotMutation(
  staleReady,
  { slotId: "a", storyId: "new", mediaUrl: "new-url" },
  { ready: true },
);
assert.equal(freshReady.a.ready, true);

assert.equal(
  guard.shouldStartStoryProgress({
    viewerReady: true,
    hasMediaUrl: true,
    mediaType: "image",
    frontReady: false,
  }),
  false,
  "slow image 2s: progress stays 0",
);
assert.equal(
  guard.shouldMarkStoryViewed({
    viewerReady: true,
    hasMediaUrl: true,
    mediaType: "video",
    frontReady: false,
    durationMs: 0,
  }),
  false,
  "slow video stays unseen until frontReady",
);
assert.equal(
  guard.shouldStartStoryProgress({
    viewerReady: true,
    hasMediaUrl: true,
    mediaType: "video",
    frontReady: true,
    durationMs: 0,
  }),
  false,
  "video waits for real duration before progress",
);
assert.equal(
  guard.shouldStartStoryProgress({
    viewerReady: true,
    hasMediaUrl: true,
    mediaType: "video",
    frontReady: true,
    durationMs: 8200,
  }),
  true,
);
assert.equal(
  guard.shouldStartStoryProgress({
    viewerReady: true,
    hasMediaUrl: false,
    frontReady: false,
  }),
  true,
  "text can start on render",
);
assert.equal(
  guard.shouldStartStoryProgress({
    viewerReady: true,
    hasMediaUrl: true,
    frontReady: true,
    errored: true,
  }),
  false,
  "error is not useful-paint and does not start progress",
);

const bufferSrc = fs.readFileSync(
  path.join(root, "src/components/stories/StoryMediaBuffers.tsx"),
  "utf8",
);
assert.match(
  bufferSrc,
  /markSlotReady\(\{[\s\S]*slotId[\s\S]*storyId[\s\S]*mediaUrl/,
);
assert.match(bufferSrc, /applyMediaSlotMutation/);
assert.match(bufferSrc, /key=\{mediaSlotDomKey\(slotId\)\}/);
assert.match(bufferSrc, /preload=\{visible \? "auto" : "metadata"\}/);
assert.doesNotMatch(bufferSrc, /key=\{`front-\$\{/);
assert.doesNotMatch(bufferSrc, /if \(!visible\) return;/);

console.log("pass stories_media_slots");
