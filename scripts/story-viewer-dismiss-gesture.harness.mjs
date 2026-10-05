import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const gesture = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storyDismissGesture.ts")).href
);

assert.equal(
  gesture.shouldDismissStoryGesture({
    deltaY: 40,
    elapsedMs: 400,
    viewportHeight: 800,
  }),
  false,
  "40px slow drag must snap back",
);

const smallThreshold = gesture.storyDismissThresholdPx(500);
const largeThreshold = gesture.storyDismissThresholdPx(1200);
assert.ok(smallThreshold >= 96 && smallThreshold <= 120);
assert.equal(largeThreshold, 180);

assert.equal(
  gesture.shouldDismissStoryGesture({
    deltaY: smallThreshold + 1,
    elapsedMs: 500,
    viewportHeight: 500,
  }),
  true,
  "distance above threshold must dismiss",
);

assert.equal(
  gesture.shouldDismissStoryGesture({
    deltaY: 70,
    elapsedMs: 60,
    viewportHeight: 900,
  }),
  true,
  "fast downward flick with minimum distance must dismiss",
);

assert.equal(
  gesture.shouldDismissStoryGesture({
    deltaY: 20,
    elapsedMs: 20,
    viewportHeight: 900,
  }),
  false,
  "tiny flick must not dismiss",
);

assert.equal(
  gesture.shouldDismissStoryGesture({
    deltaY: -180,
    elapsedMs: 120,
    viewportHeight: 900,
  }),
  false,
  "upward movement belongs to reply, not viewer dismiss",
);

const viewerSrc = fs.readFileSync(
  path.join(root, "src/components/stories/StoryViewer.tsx"),
  "utf8",
);
const blurSrc = fs.readFileSync(
  path.join(root, "src/components/stories/AdminStoryBlurButton.tsx"),
  "utf8",
);

assert.match(viewerSrc, /translate3d\(0, \$\{dismissDragY\}px, 0\)/);
assert.match(viewerSrc, /setDismissDragY\(Math\.max\(0, deltaDown\)\)/);
assert.match(viewerSrc, /onPointerCancel=\{handlePointerCancel\}/);
assert.match(viewerSrc, /replyOpen \|\| viewersOpen \|\| reportOpen \|\| dismissAnimating/);
assert.match(viewerSrc, /shouldOpenStoryViewersGesture/);
assert.match(viewerSrc, /if \(!pointerRef\.current\.tracking\) return/);
assert.match(viewerSrc, /pointerType === "mouse" && event\.buttons === 0/);
assert.match(viewerSrc, /deltaDown > absX \* 1\.1/);
assert.match(viewerSrc, /STORY_DISMISS_ANIMATION_MS/);
assert.match(viewerSrc, /exitStoryViewer\("manual"\)/);

assert.match(
  blurSrc,
  /right-36 top-6 z-50 inline-flex h-11 w-11 items-center justify-center/,
);
assert.doesNotMatch(blurSrc, /right-36 top-6[^\n]*h-8 w-8/);
assert.match(blurSrc, /Eye size=\{20\}/);
assert.match(blurSrc, /EyeOff size=\{20\}/);

console.log(
  JSON.stringify({
    gate: "STORY_VIEWER_DISMISS_GESTURE",
    pass: true,
    covers: [
      "slow-short-snapback",
      "distance-dismiss",
      "velocity-dismiss",
      "tiny-flick-no-dismiss",
      "upward-reply-isolation",
      "viewport-thresholds",
      "interactive-root-translate",
      "pointer-cancel-reset",
      "admin-blur-alignment",
    ],
  }),
);
