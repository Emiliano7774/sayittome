/**
 * Adaptive story caption contrast.
 *   node scripts/story-caption-tone.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tone = await import(pathToFileURL(path.join(root, "src/lib/stories/storyCaptionTone.ts")).href);

assert.equal(tone.captionToneFromLuma(0.2), "light");
assert.equal(tone.captionToneFromLuma(0.9), "dark");
assert.equal(tone.captionToneFromLuma(tone.STORY_CAPTION_LUMA_THRESHOLD), "dark");

const darkPixels = new Uint8ClampedArray([10, 10, 10, 255, 8, 8, 8, 255]);
const lightPixels = new Uint8ClampedArray([250, 250, 250, 255, 240, 240, 240, 255]);
assert.ok(tone.averageRgbaLuma(darkPixels) < 0.2);
assert.ok(tone.averageRgbaLuma(lightPixels) > 0.8);

const viewer = fs.readFileSync(path.join(root, "src/components/stories/StoryViewer.tsx"), "utf8");
assert.match(viewer, /storyCaptionToneClass/);
assert.match(viewer, /sampleStoryMediaCaptionTone/);

console.log("PASS story-caption-tone");
