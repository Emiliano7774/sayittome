/**
 * STALE_MAIN_TAB_ROUTE_SHELL — Next page slot must stay suppressed when
 * keep-alive owns a different concrete main tab (Stories↔Chats soft pushState).
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const tabs = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/mainTabKeepAlive.ts")).href
);

tabs.pinMainTabKeepAlive();
tabs.markMainTabVisited("/stories");
tabs.markMainTabVisited("/chats");
tabs.markMainTabVisited("/boost");
tabs.markMainTabVisited("/settings");

// Cold own route: keep-alive mounts the panel → Next page returns null.
assert.equal(tabs.isMainTabRouteHandledByKeepAlive("/stories", "/stories"), true);
assert.equal(tabs.isMainTabRouteHandledByKeepAlive("/chats", "/chats"), true);

// Decisive regression: stale StoriesPage still mounted after soft-nav to /chats.
// usePathname() is already /chats but the component is StoriesPage (ownHref=/stories).
assert.equal(
  tabs.isMainTabRouteHandledByKeepAlive("/chats", "/stories"),
  true,
  "stale StoriesPage must suppress when pathname=/chats",
);
assert.equal(
  tabs.isMainTabRouteHandledByKeepAlive("/stories", "/chats"),
  true,
  "stale ChatsPage must suppress when pathname=/stories",
);

// Incoming latch before URL catches up: StoriesPage still sees /stories pathname
// while bar already armed /chats.
tabs.armIncomingBarTab("/chats");
assert.equal(tabs.isMainTabRouteHandledByKeepAlive("/stories", "/stories"), true);
assert.equal(tabs.isMainTabRouteHandledByKeepAlive("/stories", "/chats"), true);
tabs.syncIncomingBarTab("/chats");

tabs.armIncomingBarTab("/stories");
assert.equal(tabs.isMainTabRouteHandledByKeepAlive("/chats", "/chats"), true);
assert.equal(tabs.isMainTabRouteHandledByKeepAlive("/chats", "/stories"), true);
tabs.syncIncomingBarTab("/stories");

// Boost/Settings same contract.
assert.equal(tabs.isMainTabRouteHandledByKeepAlive("/chats", "/boost"), true);
assert.equal(tabs.isMainTabRouteHandledByKeepAlive("/stories", "/settings"), true);
assert.equal(tabs.isMainTabRouteHandledByKeepAlive("/boost", "/boost"), true);

// Non-main must not falsely suppress via concrete-main-tab branch alone when
// keep-alive host is not rendering for that path without pin… (pinned above)
// Profile routes: host still renders when pinned, but effective path is non-main.
// effective=/u/ada is not concrete main tab → only suppress if path===href mount.
assert.equal(tabs.isMainTabRouteHandledByKeepAlive("/u/ada", "/stories"), false);
assert.equal(tabs.isMainTabRouteHandledByKeepAlive("/u/ada", "/chats"), false);

console.log(
  JSON.stringify({
    gate: "STALE_MAIN_TAB_ROUTE_SHELL",
    pass: true,
    covers: [
      "stories-stale-on-/chats",
      "chats-stale-on-/stories",
      "incoming-latch",
      "boost-settings",
      "non-main-no-false-suppress",
    ],
  }),
);
