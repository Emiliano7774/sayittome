/**
 * STORY_EXIT_NO_SHUFFLE — auto timer stays on Historias; manual back honors Shuffle stash.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const nav = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/storyReturnNav.ts")).href
);

// Auto: never leave Historias section for Shuffle.
nav.stashStoryReturnTo("/shuffle");
assert.equal(nav.resolveStoryAutoExitDestination("/stories/demo"), "/stories");
assert.equal(nav.resolveStoryViewerExitDestination("/stories/demo", "auto"), "/stories");

nav.stashStoryReturnTo("/shuffle");
assert.equal(
  nav.resolveStoryManualExitDestination("/stories/demo"),
  "/shuffle",
  "manual close must return to exact Shuffle when opened from shuffle",
);

nav.stashStoryReturnTo("/u/demo");
assert.equal(nav.resolveStoryManualExitDestination("/stories/demo"), "/u/demo");
nav.stashStoryReturnTo("/u/demo");
assert.equal(nav.resolveStoryAutoExitDestination("/stories/demo"), "/u/demo");

const viewerSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(path.join(root, "src/components/stories/StoryViewer.tsx"), "utf8"),
);
assert.match(viewerSrc, /exitStoryViewer\("auto"\)/);
assert.match(viewerSrc, /exitStoryViewer\("manual"\)/);

const poolSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(path.join(root, "src/hooks/useShufflePool.ts"), "utf8"),
);
assert.match(poolSrc, /stashStoryReturnTo\("\/shuffle"\)/);

const pageSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(path.join(root, "src/app/stories/[username]/page.tsx"), "utf8"),
);
assert.doesNotMatch(pageSrc, /previous !== "\/shuffle"/);
assert.match(pageSrc, /if \(peekStoryReturnTo\(\)\) return/);

console.log(JSON.stringify({ gate: "STORY_EXIT_NO_SHUFFLE", pass: true }, null, 2));
