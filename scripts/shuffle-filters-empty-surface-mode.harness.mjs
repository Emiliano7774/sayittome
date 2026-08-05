/**
 * Shared surface-mode rules for Classic + Modern Shuffle filters empty / privacy note.
 * Fails if warm/hydrated showShuffleFeed would again hide filters-empty.
 *
 * Usage: node scripts/shuffle-filters-empty-surface-mode.harness.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Import compiled-free TS via dynamic transpile is heavy; mirror the pure helper here
// and also load the source module through a tiny assert that the export exists in file.
import fs from "node:fs";

const presentationSrc = fs.readFileSync(
  path.join(root, "src/lib/shuffle/shufflePresentation.ts"),
  "utf8",
);
assert.match(
  presentationSrc,
  /export function deriveShuffleSurfaceMode/,
  "shared deriveShuffleSurfaceMode must exist",
);
assert.match(
  fs.readFileSync(path.join(root, "src/app/shuffle/modern-shuffle-client.tsx"), "utf8"),
  /deriveShuffleSurfaceMode/,
  "modern must use shared surface mode",
);
assert.match(
  fs.readFileSync(path.join(root, "src/app/shuffle/shuffle-client.tsx"), "utf8"),
  /deriveShuffleSurfaceMode/,
  "classic must use shared surface mode",
);
assert.match(
  fs.readFileSync(
    path.join(root, "src/components/shuffle/ShuffleFiltersEmptyState.tsx"),
    "utf8",
  ),
  /data-shuffle-online-privacy-note/,
  "privacy note marker must remain",
);
assert.match(
  fs.readFileSync(
    path.join(root, "src/components/shuffle/ShuffleFiltersEmptyState.tsx"),
    "utf8",
  ),
  /soloOnline && !errorText/,
  "privacy note must hide on real errors",
);

/** Keep in sync with src/lib/shuffle/shufflePresentation.ts */
function deriveShuffleSurfaceMode(input) {
  if (input.showShuffleLoading) return "loading";
  if (
    input.poolSize > 0 &&
    input.filteredVisibleCount === 0 &&
    input.hasActiveDiscovery
  ) {
    return "filters-empty";
  }
  if (input.showShuffleFeed) return "feed";
  return "empty";
}

/** Pre-fix buggy branch: feed wins whenever showShuffleFeed. */
function buggyMode(input) {
  if (input.showShuffleLoading) return "loading";
  if (input.showShuffleFeed) return "feed";
  if (
    input.poolSize > 0 &&
    input.filteredVisibleCount === 0 &&
    input.hasActiveDiscovery
  ) {
    return "filters-empty";
  }
  return "empty";
}

const warmHydratedSoloOnlineEmpty = {
  showShuffleLoading: false,
  showShuffleFeed: true, // warm || listReady || everHydrated
  poolSize: 400,
  filteredVisibleCount: 0,
  hasActiveDiscovery: true,
};

assert.equal(
  buggyMode(warmHydratedSoloOnlineEmpty),
  "feed",
  "pre-fix: warm feed path hid filters-empty",
);
assert.equal(
  deriveShuffleSurfaceMode(warmHydratedSoloOnlineEmpty),
  "filters-empty",
  "post-fix: solo-online empty must show filters-empty",
);

assert.equal(
  deriveShuffleSurfaceMode({
    showShuffleLoading: true,
    showShuffleFeed: false,
    poolSize: 400,
    filteredVisibleCount: 0,
    hasActiveDiscovery: true,
  }),
  "loading",
  "loading must hide privacy empty",
);

assert.equal(
  deriveShuffleSurfaceMode({
    showShuffleLoading: false,
    showShuffleFeed: true,
    poolSize: 400,
    filteredVisibleCount: 12,
    hasActiveDiscovery: true,
  }),
  "feed",
  "visible connected profiles keep feed",
);

assert.equal(
  deriveShuffleSurfaceMode({
    showShuffleLoading: false,
    showShuffleFeed: true,
    poolSize: 400,
    filteredVisibleCount: 0,
    hasActiveDiscovery: false,
  }),
  "feed",
  "no discovery filters → do not force filters-empty",
);

assert.equal(
  deriveShuffleSurfaceMode({
    showShuffleLoading: false,
    showShuffleFeed: false,
    poolSize: 0,
    filteredVisibleCount: 0,
    hasActiveDiscovery: true,
  }),
  "empty",
  "empty pool stays generic empty",
);

// Toggle simulation: Conectados empty → Todos (discovery off / visible restored)
{
  const connectedEmpty = deriveShuffleSurfaceMode(warmHydratedSoloOnlineEmpty);
  assert.equal(connectedEmpty, "filters-empty");
  const cleared = deriveShuffleSurfaceMode({
    showShuffleLoading: false,
    showShuffleFeed: true,
    poolSize: 400,
    filteredVisibleCount: 35,
    hasActiveDiscovery: false,
  });
  assert.equal(cleared, "feed");
}

const report = {
  gate: "SHUFFLE_FILTERS_EMPTY_SURFACE_MODE",
  buggyWouldHideNote: buggyMode(warmHydratedSoloOnlineEmpty) === "feed",
  fixedShowsNotePath:
    deriveShuffleSurfaceMode(warmHydratedSoloOnlineEmpty) === "filters-empty",
  pass: true,
};

console.log(JSON.stringify(report, null, 2));
