/**
 * Cold/warm destination paint gates — no full-page spinner when cache/keep-alive exists.
 * Usage: node --experimental-strip-types scripts/nav-warm-paint-gates.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const profileReady = await import(
  pathToFileURL(path.join(root, "src/hooks/useProfileReady.ts")).href
);
const inboxReady = await import(
  pathToFileURL(path.join(root, "src/hooks/useChatsInboxReady.ts")).href
);
const shuffleWarm = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleWarmVisual.ts")).href
);
const nav = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleFeedScroll.ts")).href
);

assert.equal(
  profileReady.shouldShowProfileLoading({ loading: true, hasProfile: true }),
  false,
);
profileReady.markProfileHydrated();
assert.equal(
  profileReady.shouldShowProfileLoading({ loading: true, hasProfile: false }),
  false,
);

assert.equal(
  inboxReady.shouldShowChatsInboxSkeleton({
    loading: true,
    sortedChats: [{ id: "c1" }],
  }),
  false,
);
inboxReady.markChatsInboxHydrated(2);
assert.equal(
  inboxReady.shouldShowChatsInboxSkeleton({
    loading: true,
    sortedChats: [],
  }),
  false,
);

assert.equal(
  shuffleWarm.shouldPaintShuffleLoadingShell({
    loading: true,
    listReady: true,
    visibleCount: 4,
  }),
  false,
);
assert.equal(
  nav.shouldSkipHardNavigateForWarmShuffle({
    href: "/shuffle",
    keepAliveActive: true,
  }),
  true,
);

console.log(JSON.stringify({ gate: "NAV_WARM_PAINT_GATES", pass: true }, null, 2));
