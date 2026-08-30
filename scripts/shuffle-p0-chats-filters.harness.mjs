/**
 * SHUFFLE_P0_CHATS_FILTERS — Chats→Shuffle reshuffle + filters-empty Limpiar recovery.
 * Exercises real entrypoints (bottom-nav tap resolver, presentation surface mode, clearFilters).
 *
 * Usage: node --experimental-strip-types scripts/shuffle-p0-chats-filters.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const bottomNav = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleBottomNavHelpers.ts")).href
);
const presentation = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shufflePresentation.ts")).href
);
const clickBridge = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleClickBridge.ts")).href
);
const recovery = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleClearFiltersRecovery.ts")).href
);
const dedupe = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/dedupeProfiles.ts")).href
);
const slots = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleSlotsStore.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleClientCache.ts")).href
);
const filtersMod = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/filters.ts")).href
);
const { pickRandomUniqueWindowIndices } = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/pickWindow.ts")).href
);

function bodyWithClass(...names) {
  const set = new Set(names);
  return {
    classList: {
      contains(name) {
        return set.has(name);
      },
      add(name) {
        set.add(name);
      },
      remove(name) {
        set.delete(name);
      },
    },
  };
}

const results = {};

// --- /chats + stale surface class must NOT reshuffle (first tap navigates) ---
{
  globalThis.document.body = bodyWithClass("sayittome-shuffle-surface-active");
  globalThis.window.location.pathname = "/chats";
  assert.equal(bottomNav.isShuffleBottomNavReshuffleTarget(), false);
  assert.equal(bottomNav.resolveShuffleBottomNavTapAction(), "navigate");
  results.chats_stale_surface_class_navigates = { pass: true, pathname: "/chats" };
}

// --- /shuffle is the only reshuffle target ---
{
  globalThis.document.body = bodyWithClass("sayittome-shuffle-route", "sayittome-shuffle-surface-active");
  globalThis.window.location.pathname = "/shuffle";
  assert.equal(bottomNav.isShuffleBottomNavReshuffleTarget(), true);
  assert.equal(bottomNav.resolveShuffleBottomNavTapAction(), "reshuffle");
  results.shuffle_live_path_reshuffles = { pass: true };
}

// --- First tap navigate, then repeated taps reshuffle (Chats→Shuffle→click) ---
{
  const trace = [];
  globalThis.document.body = bodyWithClass("sayittome-shuffle-surface-active");
  globalThis.window.location.pathname = "/chats";

  const first = bottomNav.resolveShuffleBottomNavTapAction();
  assert.equal(first, "navigate");
  trace.push(first);
  globalThis.window.location.pathname = "/shuffle";
  globalThis.document.body.classList.add("sayittome-shuffle-surface-active");

  let clickCount = 0;
  clickBridge.registerShuffleClickHandler(() => {
    clickCount += 1;
  });

  for (let i = 0; i < 3; i += 1) {
    const action = bottomNav.resolveShuffleBottomNavTapAction();
    assert.equal(action, "reshuffle");
    trace.push(action);
    clickBridge.triggerShuffleClick();
  }
  clickBridge.registerShuffleClickHandler(null);

  assert.deepEqual(trace, ["navigate", "reshuffle", "reshuffle", "reshuffle"]);
  assert.equal(clickCount, 3);
  results.chats_then_shuffle_repeated_reshuffle = {
    pass: true,
    trace,
    clickCount,
  };
}

// --- Repeated Cambiar perfiles via real click bridge ---
{
  let clickCount = 0;
  clickBridge.registerShuffleClickHandler(() => {
    clickCount += 1;
  });
  clickBridge.triggerShuffleClick();
  clickBridge.triggerShuffleClick();
  clickBridge.triggerShuffleClick();
  assert.equal(clickCount, 3);
  clickBridge.registerShuffleClickHandler(null);
  results.shuffle_click_bridge_repeated = { pass: true, clicks: clickCount };
}

// --- Filters empty → Limpiar: real presentation.deriveShuffleSurfaceMode + deal window ---
{
  function profile(username, uid) {
    return {
      uid,
      username,
      bio: "",
      photo: "x",
      showOnline: false,
      blurPhoto: false,
      sexo: "mujer",
    };
  }

  const rows = Array.from({ length: 40 }, (_, i) => profile(`user${i}`, `u${i}`));
  cache.writeCachedShufflePool(rows);
  slots.resetShuffleWindowSlots();

  const restrictive = { ...filtersMod.defaultShuffleFilters(), sexo: "hombre" };
  const storyOwners = new Set();
  const now = Date.now();
  const filtered = rows.filter((row) =>
    filtersMod.profileMatchesShuffleFilters(row, restrictive, { storyOwnerUids: storyOwners, now }),
  );
  assert.equal(filtered.length, 0, "restrictive filter must yield zero active pool");

  assert.equal(
    presentation.deriveShuffleSurfaceMode({
      showShuffleLoading: false,
      showShuffleFeed: true,
      poolSize: rows.length,
      filteredVisibleCount: 0,
      hasActiveDiscovery: true,
    }),
    "filters-empty",
  );

  const cleared = filtersMod.defaultShuffleFilters();
  const unfiltered = dedupe.dedupeShuffleProfiles(
    rows.filter((row) =>
      filtersMod.profileMatchesShuffleFilters(row, cleared, { storyOwnerUids: storyOwners, now }),
    ),
  );
  assert.equal(unfiltered.length, rows.length);

  assert.equal(
    recovery.needsPoolFetchAfterClearFilters({
      visibleSlotCount: 0,
      activePoolLength: unfiltered.length,
    }),
    false,
  );

  const scratch = new Int32Array(40);
  const windowIdx = new Int32Array(40);
  const regularCount = pickRandomUniqueWindowIndices(
    unfiltered,
    scratch,
    windowIdx,
    35,
    undefined,
    { strictExclude: false },
  );
  assert.ok(regularCount > 0);
  slots.setShuffleSlotsWithFeatured([], unfiltered, windowIdx, regularCount, true);
  const visible = slots.getVisibleShuffleProfiles();
  assert.ok(visible.length > 0);
  assert.equal(
    presentation.deriveShuffleSurfaceMode({
      showShuffleLoading: false,
      showShuffleFeed: true,
      poolSize: rows.length,
      filteredVisibleCount: visible.length,
      hasActiveDiscovery: false,
    }),
    "feed",
  );
  results.filters_empty_clear_repopulates = {
    pass: true,
    visibleAfterClear: visible.length,
    activePoolAfterClear: unfiltered.length,
    surfaceModeBefore: "filters-empty",
    surfaceModeAfter: "feed",
  };
}

// --- Limpiar must fetch when active pool empty ---
{
  assert.equal(
    recovery.needsPoolFetchAfterClearFilters({
      visibleSlotCount: 0,
      activePoolLength: 0,
    }),
    true,
  );
  assert.equal(
    recovery.needsPoolFetchAfterClearFilters({
      visibleSlotCount: 12,
      activePoolLength: 400,
    }),
    false,
  );
  results.clear_filters_fetch_when_active_pool_empty = { pass: true };
}

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_P0_CHATS_FILTERS",
      pass: true,
      base: "7418bb80b420ea17cef3555aaa7fab53cfdc8c92",
      cases: results,
    },
    null,
    2,
  ),
);

// Sync asserts finish above; exit before presentation import microtasks keep the process alive.
process.exit(0);
