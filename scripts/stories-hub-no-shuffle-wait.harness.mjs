/**
 * STORIES_HUB_NO_SHUFFLE_WAIT — Historias hub must not auto-navigate to Shuffle while idle.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const nav = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/storyReturnNav.ts")).href
);

const hubSrc = fs.readFileSync(path.join(root, "src/components/stories/StoriesHub.tsx"), "utf8");
const traySrc = fs.readFileSync(path.join(root, "src/components/stories/StoriesTray.tsx"), "utf8");
const mosaicSrc = fs.readFileSync(path.join(root, "src/components/stories/StoriesMosaic.tsx"), "utf8");
const bootstrapSrc = fs.readFileSync(
  path.join(root, "src/components/stories/StoriesBootstrap.tsx"),
  "utf8",
);
const viewerSrc = fs.readFileSync(path.join(root, "src/components/stories/StoryViewer.tsx"), "utf8");

for (const src of [hubSrc, traySrc, mosaicSrc]) {
  assert.doesNotMatch(src, /\/shuffle/);
  assert.doesNotMatch(src, /router\.push/);
}

assert.doesNotMatch(bootstrapSrc, /\/shuffle/);
assert.match(bootstrapSrc, /refreshStoriesIndex/);
assert.doesNotMatch(bootstrapSrc, /router\.push|location\.href/);

nav.stashStoryReturnTo("/shuffle");
assert.equal(nav.resolveStoryAutoExitDestination("/stories"), "/stories");
nav.stashStoryReturnTo("/shuffle");
assert.equal(nav.resolveStoryViewerExitDestination("/stories/demo", "auto"), "/stories");

assert.match(viewerSrc, /exitStoryViewer\("auto"\)/);
assert.doesNotMatch(
  viewerSrc,
  /resolveStoryManualExitDestination[\s\S]*exitStoryViewer\("auto"\)/,
);

console.log(JSON.stringify({ gate: "STORIES_HUB_NO_SHUFFLE_WAIT", pass: true }, null, 2));
