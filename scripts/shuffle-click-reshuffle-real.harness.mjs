/**
 * SHUFFLE_CLICK_RESHUFFLE_REAL — regression for d527814 production no-op.
 * Exercises resolveShuffleReshufflePool + real window deal (pickWindow/slots/dedupe),
 * not the click-bridge dummy handler.
 *
 * Usage: node --experimental-strip-types scripts/shuffle-click-reshuffle-real.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

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
const filtersMod = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/filters.ts")).href
);
const { pickRandomUniqueWindowIndices, SHUFFLE_WINDOW_SIZE } = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/pickWindow.ts")).href
);

const POOL_SIZE = 517;
const LEAD = 10;
const results = {};

function clearShuffleHarnessCache() {
  if (globalThis.sessionStorage?.removeItem) {
    globalThis.sessionStorage.removeItem(cache.SHUFFLE_POOL_KEY);
    globalThis.sessionStorage.removeItem("sayittome:shuffle:stats:v16");
  }
}

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

function buildPool(size = POOL_SIZE) {
  return Array.from({ length: size }, (_, i) => profile(`user${i}`, `u${i}`));
}

/** Minimal applyWindowFromPool deal path (forceReplace, featured-aware, no exclude store). */
function dealWindowFromPool(pool, featured = [], options = {}) {
  const scratch = [];
  const windowIdx = new Int32Array(SHUFFLE_WINDOW_SIZE);
  const excludeRecentBatches = options.excludeRecentBatches === true;
  const forceReplace = options.forceReplace !== false;
  const resetBatchMemory = options.resetBatchMemory === true;

  const feat = dedupe.dedupeShuffleProfiles(featured);
  const featuredKeys = new Set();
  for (const row of feat) {
    for (const key of dedupe.shuffleProfileDedupeKeys(row)) {
      featuredKeys.add(key);
    }
  }

  const eligible = dedupe.dedupeShuffleProfiles(
    pool.filter((row) => {
      const keys = dedupe.shuffleProfileDedupeKeys(row);
      return keys.length === 0 || !keys.some((key) => featuredKeys.has(key));
    }),
  );
  const len = eligible.length;
  const featuredCount = feat.length;

  if (len === 0 && featuredCount === 0) {
    const hadVisible = slots.getVisibleShuffleProfiles().length > 0;
    if (hadVisible && !resetBatchMemory && !forceReplace) {
      return { dealt: false, reason: "empty-pool-had-visible-noop" };
    }
    if (hadVisible && !resetBatchMemory && forceReplace) {
      return { dealt: false, reason: "empty-pool-force-had-visible" };
    }
    slots.setShuffleSlotsWithFeatured([], [], windowIdx, 0, true);
    return { dealt: true, reason: "cleared" };
  }

  const remainingSlots = Math.max(0, SHUFFLE_WINDOW_SIZE - featuredCount);
  const regularCount =
    len > 0
      ? pickRandomUniqueWindowIndices(
          eligible,
          scratch,
          windowIdx,
          remainingSlots,
          undefined,
          { strictExclude: excludeRecentBatches },
        )
      : 0;

  slots.setShuffleSlotsWithFeatured(feat, eligible, windowIdx, regularCount, forceReplace);
  return { dealt: true, regularCount, featuredCount };
}

function assertFeaturedPreserved(visible, featured, label) {
  for (const row of featured) {
    const key = dedupe.shuffleProfileIdentityKey(row) || row.uid || row.username;
    assert.ok(
      visible.some(
        (visibleRow) =>
          (dedupe.shuffleProfileIdentityKey(visibleRow) || visibleRow.uid || visibleRow.username) ===
          key,
      ),
      `${label}: featured ${row.username} missing after reshuffle`,
    );
  }
}

function runSingleReshuffle(dealPool, label, featured = []) {
  const before = slots.getVisibleShuffleProfiles();
  const beforeLead = reshuffle.shuffleVisibleLeadSignature(before, LEAD);

  const outcome = reshuffle.runShuffleClickReshuffleAttempts({
    getVisible: slots.getVisibleShuffleProfiles,
    attempts: reshuffle.SHUFFLE_CLICK_RESUFFLE_ATTEMPTS,
    applyAttempt: (opts) => {
      dealWindowFromPool(dealPool, featured, opts);
    },
    rememberBatch: () => {},
    leadCount: LEAD,
  });

  const visible = slots.getVisibleShuffleProfiles();
  assertWindowDeduped(visible, label);
  assert.ok(outcome.changed, `${label}: reshuffle must change window`);
  const lead = reshuffle.shuffleVisibleLeadSignature(visible, LEAD);
  assert.notEqual(lead, beforeLead, `${label}: lead signature unchanged`);
  if (featured.length > 0) {
    assertFeaturedPreserved(visible, featured, label);
  }
  return { beforeLead, lead, visible };
}

function runThreeDistinctWindows(dealPool, label, featured = []) {
  const leadSignatures = [];
  const setSignatures = [];

  for (let round = 0; round < 3; round += 1) {
    const before = slots.getVisibleShuffleProfiles();
    const beforeLead = reshuffle.shuffleVisibleLeadSignature(before, LEAD);

    const outcome = reshuffle.runShuffleClickReshuffleAttempts({
      getVisible: slots.getVisibleShuffleProfiles,
      attempts: reshuffle.SHUFFLE_CLICK_RESUFFLE_ATTEMPTS,
      applyAttempt: (opts) => {
        dealWindowFromPool(dealPool, featured, opts);
      },
      rememberBatch: () => {},
      leadCount: LEAD,
    });

    const visible = slots.getVisibleShuffleProfiles();
    assert.ok(visible.length >= 3, `${label} round ${round}: expected visible window`);
    assertWindowDeduped(visible, `${label} round ${round}`);
    assert.ok(outcome.changed, `${label} round ${round}: reshuffle must change window`);
    if (featured.length > 0) {
      assertFeaturedPreserved(visible, featured, `${label} round ${round}`);
    }

    const lead = reshuffle.shuffleVisibleLeadSignature(visible, LEAD);
    const setSig = reshuffle.shuffleWindowSetSignature(visible);
    assert.notEqual(lead, beforeLead, `${label} round ${round}: lead signature unchanged`);
    leadSignatures.push(lead);
    setSignatures.push(setSig);
  }

  assert.equal(
    new Set(leadSignatures).size,
    3,
    `${label}: expected 3 distinct lead-10 windows, got ${leadSignatures.join(" :: ")}`,
  );
  assert.equal(
    new Set(setSignatures).size,
    3,
    `${label}: expected 3 distinct window sets`,
  );

  return { leadSignatures, setSignatures };
}

function assertWindowDeduped(visible, label) {
  const keys = visible.map(
    (row) => dedupe.shuffleProfileIdentityKey(row) || row.uid || row.username,
  );
  assert.equal(keys.length, new Set(keys).size, `${label}: duplicate identities in window`);
}

function buildFeatured(count = 2) {
  return Array.from({ length: count }, (_, i) => {
    const row = profile(`Featured${i}`, `feat-${i}`);
    row.shuffleFeatured = true;
    return row;
  });
}

// --- Chats→Shuffle + clear recovery: active/full pool empty, cache + pinned visible ---
{
  const rows = buildPool();
  cache.writeCachedShufflePool(rows);
  slots.resetShuffleWindowSlots();

  const restrictive = { ...filtersMod.defaultShuffleFilters(), sexo: "hombre" };
  const cleared = filtersMod.defaultShuffleFilters();
  const storyOwners = new Set();
  const now = Date.now();

  const scratch = [];
  const windowIdx = new Int32Array(SHUFFLE_WINDOW_SIZE);
  const initialCount = pickRandomUniqueWindowIndices(rows, scratch, windowIdx, SHUFFLE_WINDOW_SIZE);
  slots.setShuffleSlotsWithFeatured([], rows, windowIdx, initialCount, true);
  const pinnedVisible = slots.getVisibleShuffleProfiles();
  assert.equal(pinnedVisible.length, SHUFFLE_WINDOW_SIZE);

  const resolved = reshuffle.resolveShuffleReshufflePool({
    activePool: [],
    fullPool: [],
    cachedPool: rows,
    visible: pinnedVisible,
    search: "",
    filters: cleared,
    storyOwnerUids: storyOwners,
    now,
  });

  assert.equal(resolved.pool.length, rows.length);
  assert.ok(resolved.hydrateFullPool?.length === rows.length);
  assert.equal(resolved.needsFetch, false);
  assert.equal(resolved.visibleFallbackOnly, false);

  const filteredEmpty = rows.filter((row) =>
    filtersMod.profileMatchesShuffleFilters(row, restrictive, { storyOwnerUids: storyOwners, now }),
  );
  assert.equal(filteredEmpty.length, 0);

  results.chats_shuffle_empty_active_reconstructs_from_cache = {
    pass: true,
    pinnedVisible: pinnedVisible.length,
    resolvedPool: resolved.pool.length,
  };
}

// --- d527814 legacy path: empty activePool deal is no-op (harness documents failure mode) ---
{
  slots.resetShuffleWindowSlots();
  const rows = buildPool();
  const scratch = [];
  const windowIdx = new Int32Array(SHUFFLE_WINDOW_SIZE);
  pickRandomUniqueWindowIndices(rows, scratch, windowIdx, SHUFFLE_WINDOW_SIZE);
  slots.setShuffleSlotsWithFeatured([], rows, windowIdx, SHUFFLE_WINDOW_SIZE, true);
  const beforeLead = reshuffle.shuffleVisibleLeadSignature(
    slots.getVisibleShuffleProfiles(),
    LEAD,
  );

  const legacyPool = reshuffle.legacyShuffleClickDealPool([]);
  const deal = dealWindowFromPool(legacyPool, [], { forceReplace: true, excludeRecentBatches: true });
  assert.equal(deal.dealt, false);
  assert.equal(deal.reason, "empty-pool-force-had-visible");

  const afterLead = reshuffle.shuffleVisibleLeadSignature(
    slots.getVisibleShuffleProfiles(),
    LEAD,
  );
  assert.equal(afterLead, beforeLead);

  results.d527814_legacy_empty_active_pool_noop = {
    pass: true,
    beforeLead,
    afterLead,
    dealReason: deal.reason,
  };
}

// --- Real reshuffle: three distinct windows on same 517 pool (post clear recovery) ---
{
  slots.resetShuffleWindowSlots();
  const rows = buildPool();
  cache.writeCachedShufflePool(rows);
  const cleared = filtersMod.defaultShuffleFilters();

  const scratch = [];
  const windowIdx = new Int32Array(SHUFFLE_WINDOW_SIZE);
  pickRandomUniqueWindowIndices(rows, scratch, windowIdx, SHUFFLE_WINDOW_SIZE);
  slots.setShuffleSlotsWithFeatured([], rows, windowIdx, SHUFFLE_WINDOW_SIZE, true);

  const resolved = reshuffle.resolveShuffleReshufflePool({
    activePool: [],
    fullPool: [],
    cachedPool: rows,
    visible: slots.getVisibleShuffleProfiles(),
    search: "",
    filters: cleared,
    storyOwnerUids: new Set(),
  });

  const three = runThreeDistinctWindows(resolved.pool, "post-clear-recovery");
  results.three_distinct_windows_same_pool = {
    pass: true,
    poolSize: resolved.pool.length,
    leadSignatures: three.leadSignatures,
  };
}

// --- Full pool in memory (active populated): still three distinct windows + dedupe ---
{
  slots.resetShuffleWindowSlots();
  const rows = buildPool();
  const cleared = filtersMod.defaultShuffleFilters();
  const active = dedupe.dedupeShuffleProfiles(rows);

  const scratch = [];
  const windowIdx = new Int32Array(SHUFFLE_WINDOW_SIZE);
  pickRandomUniqueWindowIndices(active, scratch, windowIdx, SHUFFLE_WINDOW_SIZE);
  slots.setShuffleSlotsWithFeatured([], active, windowIdx, SHUFFLE_WINDOW_SIZE, true);

  const resolved = reshuffle.resolveShuffleReshufflePool({
    activePool: active,
    fullPool: active,
    cachedPool: rows,
    visible: slots.getVisibleShuffleProfiles(),
    search: "",
    filters: cleared,
    storyOwnerUids: new Set(),
  });

  assert.equal(resolved.pool.length, active.length);
  const three = runThreeDistinctWindows(resolved.pool, "active-pool-ready");
  results.active_pool_three_windows_deduped = {
    pass: true,
    poolSize: resolved.pool.length,
    leadSignatures: three.leadSignatures,
  };
}

// --- Expired cache (TTL): active/full/cache empty, visible=35 → fallback + needsFetch ---
{
  clearShuffleHarnessCache();
  slots.resetShuffleWindowSlots();
  const rows = buildPool();
  const cleared = filtersMod.defaultShuffleFilters();

  const scratch = [];
  const windowIdx = new Int32Array(SHUFFLE_WINDOW_SIZE);
  pickRandomUniqueWindowIndices(rows, scratch, windowIdx, SHUFFLE_WINDOW_SIZE);
  slots.setShuffleSlotsWithFeatured([], rows, windowIdx, SHUFFLE_WINDOW_SIZE, true);
  const visible = slots.getVisibleShuffleProfiles();
  assert.equal(visible.length, SHUFFLE_WINDOW_SIZE);
  assert.equal(cache.readCachedShufflePool()?.length ?? 0, 0, "cache must be empty (expired)");

  const resolved = reshuffle.resolveShuffleReshufflePool({
    activePool: [],
    fullPool: [],
    cachedPool: [],
    visible,
    search: "",
    filters: cleared,
    storyOwnerUids: new Set(),
  });

  assert.equal(resolved.pool.length, SHUFFLE_WINDOW_SIZE);
  assert.equal(resolved.needsFetch, true);
  assert.equal(resolved.visibleFallbackOnly, true);

  const fallback = runSingleReshuffle(resolved.pool, "expired-cache-visible-fallback");
  assert.notEqual(fallback.lead, fallback.beforeLead);

  results.expired_cache_visible_fallback_reshuffles = {
    pass: true,
    visibleCount: visible.length,
    needsFetch: resolved.needsFetch,
    beforeLead: fallback.beforeLead,
    afterLead: fallback.lead,
  };
}

// --- all-empty → fetch → deal: distinct signature after simulated load ---
{
  clearShuffleHarnessCache();
  slots.resetShuffleWindowSlots();
  const cleared = filtersMod.defaultShuffleFilters();

  const emptyResolved = reshuffle.resolveShuffleReshufflePool({
    activePool: [],
    fullPool: [],
    cachedPool: [],
    visible: [],
    search: "",
    filters: cleared,
    storyOwnerUids: new Set(),
  });
  assert.equal(emptyResolved.pool.length, 0);
  assert.equal(emptyResolved.needsFetch, true);
  assert.equal(emptyResolved.visibleFallbackOnly, false);

  const fetched = buildPool();
  cache.writeCachedShufflePool(fetched);

  const afterFetch = reshuffle.resolveShuffleReshufflePool({
    activePool: fetched,
    fullPool: fetched,
    cachedPool: fetched,
    visible: slots.getVisibleShuffleProfiles(),
    search: "",
    filters: cleared,
    storyOwnerUids: new Set(),
  });

  assert.equal(afterFetch.pool.length, fetched.length);
  assert.equal(afterFetch.needsFetch, false);
  assert.equal(afterFetch.visibleFallbackOnly, false);

  const deal = runSingleReshuffle(afterFetch.pool, "fetch-then-deal");
  const second = runSingleReshuffle(afterFetch.pool, "fetch-then-deal-2");
  assert.notEqual(deal.lead, second.lead);

  results.all_empty_fetch_then_deal = {
    pass: true,
    fetchedPoolSize: fetched.length,
    firstLead: deal.lead,
    secondLead: second.lead,
  };
}

// --- visible fallback then fetch: mirrors handleShuffleClick two-phase deal ---
{
  clearShuffleHarnessCache();
  slots.resetShuffleWindowSlots();
  const rows = buildPool();
  const cleared = filtersMod.defaultShuffleFilters();

  const scratch = [];
  const windowIdx = new Int32Array(SHUFFLE_WINDOW_SIZE);
  pickRandomUniqueWindowIndices(rows, scratch, windowIdx, SHUFFLE_WINDOW_SIZE);
  slots.setShuffleSlotsWithFeatured([], rows, windowIdx, SHUFFLE_WINDOW_SIZE, true);
  const visible = slots.getVisibleShuffleProfiles();

  const phase1 = reshuffle.resolveShuffleReshufflePool({
    activePool: [],
    fullPool: [],
    cachedPool: [],
    visible,
    search: "",
    filters: cleared,
    storyOwnerUids: new Set(),
  });
  const immediate = runSingleReshuffle(phase1.pool, "two-phase-immediate");

  const phase2 = reshuffle.resolveShuffleReshufflePool({
    activePool: rows,
    fullPool: rows,
    cachedPool: rows,
    visible: slots.getVisibleShuffleProfiles(),
    search: "",
    filters: cleared,
    storyOwnerUids: new Set(),
  });
  assert.equal(phase2.visibleFallbackOnly, false);
  const afterFetch = runSingleReshuffle(phase2.pool, "two-phase-after-fetch");
  assert.notEqual(afterFetch.lead, immediate.lead);

  results.visible_fallback_then_fetch_deal = {
    pass: true,
    immediateLead: immediate.lead,
    afterFetchLead: afterFetch.lead,
  };
}

// --- featured>0 + pool>0: deal runs, signature changes, featured preserved ---
{
  clearShuffleHarnessCache();
  slots.resetShuffleWindowSlots();
  const rows = buildPool();
  const featured = buildFeatured(2);
  const cleared = filtersMod.defaultShuffleFilters();

  const scratch = [];
  const windowIdx = new Int32Array(SHUFFLE_WINDOW_SIZE);
  const regularCount = pickRandomUniqueWindowIndices(
    rows,
    scratch,
    windowIdx,
    SHUFFLE_WINDOW_SIZE - featured.length,
  );
  slots.setShuffleSlotsWithFeatured(featured, rows, windowIdx, regularCount, true);

  assert.equal(reshuffle.canShuffleReshuffleDeal(rows.length, featured.length), true);
  assert.equal(reshuffle.shouldRunTwoPhaseShuffleReshuffle(
    { pool: rows, needsFetch: false, visibleFallbackOnly: false, hydrateFullPool: null },
    featured.length,
  ), false);

  const deal = runSingleReshuffle(rows, "featured-plus-pool", featured);
  results.featured_plus_pool_reshuffles = {
    pass: true,
    featuredCount: featured.length,
    poolSize: rows.length,
    beforeLead: deal.beforeLead,
    afterLead: deal.lead,
  };
}

// --- featured>0 + pool=0: two-phase (featured deal → fetch → full deal), featured preserved ---
{
  clearShuffleHarnessCache();
  slots.resetShuffleWindowSlots();
  const featured = buildFeatured(2);
  const cleared = filtersMod.defaultShuffleFilters();

  slots.setShuffleSlotsWithFeatured(featured, [], new Int32Array(SHUFFLE_WINDOW_SIZE), 0, true);
  const visible = slots.getVisibleShuffleProfiles();
  assert.equal(visible.length, featured.length);

  const phase1Resolved = reshuffle.resolveShuffleReshufflePool({
    activePool: [],
    fullPool: [],
    cachedPool: [],
    visible,
    search: "",
    filters: cleared,
    storyOwnerUids: new Set(),
  });

  assert.equal(reshuffle.canShuffleReshuffleDeal(phase1Resolved.pool.length, featured.length), true);
  assert.equal(
    reshuffle.shouldRunTwoPhaseShuffleReshuffle(phase1Resolved, featured.length),
    true,
  );

  const beforeLead = reshuffle.shuffleVisibleLeadSignature(visible, LEAD);
  assertFeaturedPreserved(visible, featured, "featured-only-before");

  dealWindowFromPool([], featured, { forceReplace: true, excludeRecentBatches: true });
  const afterPhase1 = slots.getVisibleShuffleProfiles();
  assertFeaturedPreserved(afterPhase1, featured, "featured-only-phase1");

  const rows = buildPool();
  cache.writeCachedShufflePool(rows);
  const phase2Resolved = reshuffle.resolveShuffleReshufflePool({
    activePool: rows,
    fullPool: rows,
    cachedPool: rows,
    visible: afterPhase1,
    search: "",
    filters: cleared,
    storyOwnerUids: new Set(),
  });

  assert.equal(phase2Resolved.visibleFallbackOnly, false);
  const afterFetch = runSingleReshuffle(phase2Resolved.pool, "featured-only-after-fetch", featured);
  assert.notEqual(afterFetch.lead, beforeLead);
  assert.ok(afterFetch.visible.length > featured.length);

  results.featured_only_pool_zero_two_phase = {
    pass: true,
    featuredCount: featured.length,
    beforeLead,
    afterFetchLead: afterFetch.lead,
    visibleAfterFetch: afterFetch.visible.length,
  };
}

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_CLICK_RESHUFFLE_REAL",
      pass: true,
      reproduces_d527814_noop: true,
      preserves_dedupe: true,
      also_run: ["test:shuffle-back-scroll-restore", "test:shuffle-dedupe"],
      cases: results,
    },
    null,
    2,
  ),
);

process.exit(0);
