/**
 * Swipe-down from a story viewer must keep the Historias hub mounted.
 * /stories/* used to drop the keep-alive host, remounting StoriesRouteContent
 * and repainting the mosaic from scratch.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const tabs = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/mainTabKeepAlive.ts")).href
);

tabs.pinStoriesHubKeepAlive();

assert.equal(
  tabs.shouldRenderMainTabKeepAliveHost("/stories/alice"),
  true,
  "story viewer must keep the main-tab host mounted",
);
assert.equal(
  tabs.shouldRenderMainTabKeepAliveHost("/stories/new"),
  true,
  "compose must keep the stories hub mounted",
);
assert.equal(
  tabs.isMainTabPanelVisible("/stories/alice", "/stories"),
  false,
  "hub stays frozen under the viewer",
);
assert.equal(
  tabs.shouldMountMainTabPanel("/stories/alice", "/stories"),
  true,
  "visited hub stays mounted while the viewer is open",
);
assert.equal(
  tabs.isMainTabPanelVisible("/stories", "/stories"),
  true,
  "dismiss to /stories reveals the same hub panel",
);

const keepAliveSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/mainTabKeepAlive.ts"),
  "utf8",
);
assert.match(keepAliveSrc, /path\.startsWith\("\/stories\/"\)/);
assert.match(keepAliveSrc, /export function pinStoriesHubKeepAlive/);

const viewerSrc = fs.readFileSync(
  path.join(root, "src/components/stories/StoryViewer.tsx"),
  "utf8",
);
assert.match(viewerSrc, /pinStoriesHubKeepAlive\(\)/);
assert.match(viewerSrc, /if \(dest === "\/stories"\)/);

const groupsSrc = fs.readFileSync(
  path.join(root, "src/hooks/useStoriesGroups.ts"),
  "utf8",
);
assert.match(groupsSrc, /applyViewer\(next, next !== lastViewer\)/);
assert.doesNotMatch(
  groupsSrc,
  /onAuthStateChanged\(auth, \(user\) => \{\s*if \(!authSettled\) return;\s*applyViewer\(resolveStoryViewerId\(user\), true\);/,
);

console.log(
  JSON.stringify({
    gate: "STORIES_HUB_KEEPALIVE_ON_VIEWER",
    pass: true,
    covers: [
      "viewer-keeps-host",
      "compose-keeps-host",
      "hub-frozen-under-viewer",
      "hub-mounted-while-viewing",
      "dismiss-reveals-same-panel",
      "viewer-pins-hub",
      "same-viewer-no-force-refresh",
    ],
  }),
);
