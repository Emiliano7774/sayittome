/**
 * Story description is saved, indexed, and shown on media playback.
 * Usage: node --experimental-strip-types scripts/story-caption.harness.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const { storyCaptionText, shouldShowStoryMediaCaption } = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storyCaption.ts")).href
);

assert.equal(storyCaptionText({ texto: "  hola  " }), "hola");
assert.equal(storyCaptionText({ texto: "" }), "");
assert.equal(storyCaptionText(null), "");
assert.equal(shouldShowStoryMediaCaption({ texto: "hola", mediaUrl: "https://x/a.jpg" }), true);
assert.equal(shouldShowStoryMediaCaption({ texto: "hola", mediaUrl: "" }), false);
assert.equal(shouldShowStoryMediaCaption({ texto: "  ", mediaUrl: "https://x/a.jpg" }), false);

const viewer = read("src/components/stories/StoryViewer.tsx");
const createPage = read("src/app/stories/new/page.tsx");
const fetchStories = read("src/lib/stories/fetchStories.ts");
const snapshot = read("src/lib/stories/storiesSnapshot.ts");

assert.match(createPage, /texto: texto\.trim\(\)/);
assert.match(fetchStories, /texto: String\(data\.texto \|\| ""\)/);
assert.match(snapshot, /texto: story\.texto/);
assert.match(viewer, /shouldShowStoryMediaCaption/);
assert.match(viewer, /data-story-caption/);
assert.match(viewer, /data-story-caption-hero/);
assert.match(viewer, /font-extralight/);

console.log(JSON.stringify({ gate: "STORY_CAPTION", pass: true }, null, 2));
