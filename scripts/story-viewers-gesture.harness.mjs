/**
 * Own-story viewers swipe thresholds.
 *   node scripts/story-viewers-gesture.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gesture = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storyViewersGesture.ts")).href
);

assert.equal(
  gesture.shouldOpenStoryViewersGesture({ deltaUp: 18, absX: 4 }),
  true,
  "short upward flick from anywhere must open viewers",
);
assert.equal(gesture.shouldOpenStoryViewersGesture({ deltaUp: 10, absX: 4 }), false);
assert.equal(gesture.shouldOpenStoryViewersGesture({ deltaUp: 30, absX: 40 }), false);

assert.equal(
  gesture.shouldCloseStoryViewersGesture({
    deltaDown: 10,
    absX: 4,
    elapsedMs: 200,
    scrollTop: 0,
  }),
  true,
);
assert.equal(
  gesture.shouldCloseStoryViewersGesture({
    deltaDown: 40,
    absX: 4,
    elapsedMs: 200,
    scrollTop: 20,
  }),
  false,
  "do not close while the list is scrolled",
);
assert.equal(
  gesture.shouldCloseStoryViewersGesture({
    deltaDown: 18,
    absX: 2,
    elapsedMs: 40,
    scrollTop: 0,
  }),
  true,
  "fast flick down closes",
);

console.log("PASS story-viewers-gesture");
