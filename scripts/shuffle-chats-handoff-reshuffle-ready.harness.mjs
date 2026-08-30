/**
 * SHUFFLE_CHATS_HANDOFF_RESHUFFLE_READY — warm Chats→Shuffle stuck defer/preparing
 * must not block listReady, loading shell, or Cambiar perfiles deal path.
 *
 * Usage: node --experimental-strip-types scripts/shuffle-chats-handoff-reshuffle-ready.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const handoff = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleHandoffState.ts")).href
);
const keep = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleKeepAlive.ts")).href
);
const ready = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleHandoffReshuffleReady.ts")).href
);
const presentation = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shufflePresentation.ts")).href
);
const reshuffle = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleClickReshuffle.ts")).href
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
const warmVisual = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleWarmVisual.ts")).href
);
const warmIntent = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleWarmHopIntent.ts")).href
);
const pinned = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shufflePinnedWindow.ts")).href
);
const atomic = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/atomicVisualHandoff.ts")).href
);

const { pickRandomUniqueWindowIndices, SHUFFLE_WINDOW_SIZE } = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/pickWindow.ts")).href
);

const SHUFFLE_HYDRATED_SESSION_KEY = "sayittome:shuffle:hydrated:v1";

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

function dealWindow(pool, featured = []) {
  const scratch = [];
  const windowIdx = new Int32Array(SHUFFLE_WINDOW_SIZE);
  const feat = dedupe.dedupeShuffleProfiles(featured);
  const eligible = dedupe.dedupeShuffleProfiles(pool);
  const remaining = Math.max(0, SHUFFLE_WINDOW_SIZE - feat.length);
  const regularCount =
    eligible.length > 0
      ? pickRandomUniqueWindowIndices(eligible, scratch, windowIdx, remaining)
      : 0;
  slots.setShuffleSlotsWithFeatured(feat, eligible, windowIdx, regularCount, true);
}

function resetHandoffState() {
  handoff.clearShuffleHandoffState();
  warmVisual.setShuffleHandoffPreparing(false);
  warmIntent.abortShuffleDestinationWarmIntent();
  atomic.resetAtomicVisualHandoff();
  pinned.clearPinnedShuffleWindow();
  slots.resetShuffleWindowSlots();
  cache.writeCachedShufflePool([]);
  globalThis.sessionStorage?.removeItem(SHUFFLE_HYDRATED_SESSION_KEY);
}

function installShuffleRouteDom() {
  const htmlClasses = new Set(["sayittome-shuffle-handoff-pending"]);
  const bodyClasses = new Set();
  globalThis.window.location.pathname = "/shuffle";
  globalThis.document.documentElement = {
    classList: {
      contains: (name) => htmlClasses.has(name),
      add: (name) => {
        htmlClasses.add(name);
      },
      remove: (name) => {
        htmlClasses.delete(name);
      },
    },
    removeAttribute: () => {},
    setAttribute: () => {},
  };
  globalThis.document.body = {
    classList: {
      contains: (name) => bodyClasses.has(name),
      add: (name) => {
        bodyClasses.add(name);
      },
      remove: (name) => {
        bodyClasses.delete(name);
      },
    },
  };
  globalThis.document.getElementById = () => null;
  return {
    htmlClasses,
    bodyClasses,
  };
}

const results = {};

// --- Cold empty: emergency/loading surface stays visible (run before warm pollutes hydration) ---
{
  resetHandoffState();
  globalThis.window.location.pathname = "/shuffle";

  assert.equal(ready.needsShuffleHandoffFinalizeForReshuffle("/shuffle"), false);
  assert.equal(presentation.shouldShowShuffleKeepAliveEmergencyShell(), true);

  const coldPres = presentation.deriveShufflePresentation({
    loading: true,
    listReady: false,
    visibleCount: 0,
    hydrationReady: true,
  });
  assert.equal(coldPres.trueCold, true);
  assert.equal(coldPres.showShuffleLoading, true);
  assert.equal(coldPres.showShuffleFeed, false);

  results.cold_empty_keeps_emergency_loading = {
    pass: true,
    showShuffleLoading: coldPres.showShuffleLoading,
    showEmergencyShell: presentation.shouldShowShuffleKeepAliveEmergencyShell(),
  };
}

// --- Warm 35-slot /shuffle: full lifecycle latch clear + reshuffle ---
{
  resetHandoffState();
  installShuffleRouteDom();
  keep.pinShuffleKeepAlive();
  warmIntent.beginShuffleDestinationWarmIntent(7, 517);
  atomic.beginAtomicVisualHandoff();
  handoff.beginShuffleRevealDeferred("/chats");
  warmVisual.setShuffleHandoffPreparing(true);

  const rows = Array.from({ length: 517 }, (_, i) => profile(`user${i}`, `u${i}`));
  cache.writeCachedShufflePool(rows);
  slots.resetShuffleWindowSlots();
  dealWindow(rows);
  const visible = slots.getVisibleShuffleProfiles();
  assert.equal(visible.length, SHUFFLE_WINDOW_SIZE);

  assert.equal(handoff.isShuffleRevealDeferred(), true);
  assert.equal(handoff.isShuffleSurfacePresented(), false);
  assert.equal(warmVisual.isShuffleHandoffPreparing(), true);
  assert.equal(warmIntent.isShuffleDestinationWarmIntentActive(), true);
  assert.equal(keep.isShuffleFeedFrozen("/shuffle"), false);
  assert.equal(presentation.shouldShowShuffleKeepAliveEmergencyShell(), false);

  assert.equal(ready.needsShuffleHandoffFinalizeForReshuffle("/shuffle"), true);

  const beforeLead = reshuffle.shuffleVisibleLeadSignature(visible, 10);
  assert.ok(keep.finalizeStuckWarmShuffleHandoffForReshuffle());

  assert.equal(handoff.isShuffleRevealDeferred(), false);
  assert.equal(handoff.isShuffleSurfacePresented(), true);
  assert.equal(warmVisual.isShuffleHandoffPreparing(), false);
  assert.equal(warmIntent.isShuffleDestinationWarmIntentActive(), false);
  assert.equal(atomic.getAtomicVisualHandoffPhase(), "presented");
  assert.equal(
    globalThis.document.documentElement.classList.contains("sayittome-shuffle-handoff-pending"),
    false,
  );
  assert.equal(keep.isShuffleFeedFrozen("/shuffle"), false);

  const afterPres = presentation.deriveShufflePresentation({
    loading: false,
    listReady: true,
    visibleCount: visible.length,
    hydrationReady: true,
  });
  assert.equal(afterPres.warm, true);
  assert.equal(afterPres.showShuffleLoading, false);
  assert.equal(afterPres.showShuffleFeed, true);

  const resolved = reshuffle.resolveShuffleReshufflePool({
    activePool: [],
    fullPool: [],
    cachedPool: rows,
    visible: slots.getVisibleShuffleProfiles(),
    search: "",
    filters: (await import(pathToFileURL(path.join(root, "src/lib/shuffle/filters.ts")).href))
      .defaultShuffleFilters(),
    storyOwnerUids: new Set(),
  });
  assert.ok(resolved.pool.length >= SHUFFLE_WINDOW_SIZE);

  const outcome = reshuffle.runShuffleClickReshuffleAttempts({
    getVisible: slots.getVisibleShuffleProfiles,
    attempts: reshuffle.SHUFFLE_CLICK_RESUFFLE_ATTEMPTS,
    applyAttempt: () => dealWindow(resolved.pool),
    rememberBatch: () => {},
    leadCount: 10,
  });
  assert.ok(outcome.changed);
  const afterLead = reshuffle.shuffleVisibleLeadSignature(slots.getVisibleShuffleProfiles(), 10);
  assert.notEqual(afterLead, beforeLead);

  results.warm_35_slot_full_lifecycle_and_reshuffle = {
    pass: true,
    visible: visible.length,
    beforeLead,
    afterLead,
  };
}

// --- Off-shuffle defer still freezes (away tab) ---
{
  resetHandoffState();
  keep.pinShuffleKeepAlive();
  handoff.beginShuffleRevealDeferred("/chats");
  assert.equal(keep.isShuffleFeedFrozen("/chats"), true);

  results.off_shuffle_defer_still_frozen = { pass: true };
}

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_CHATS_HANDOFF_RESHUFFLE_READY",
      pass: true,
      cases: results,
    },
    null,
    2,
  ),
);

process.exit(0);
