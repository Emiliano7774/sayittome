/**
 * Warm shuffle presentation invariants including hop warm-intent (INVARIANT 0).
 * Run: node scripts/shuffle-presentation-invariants.mjs
 */

import assert from "node:assert/strict";

function deriveCold(input, ctx) {
  const restorable = ctx.restorableSlots ?? 0;
  const durableRestorable = ctx.durableRestorable ?? restorable;
  const hydrated = ctx.hydrated ?? false;
  const deferred = ctx.deferred ?? false;
  const preparing = ctx.preparing ?? false;
  const warmIntent = ctx.warmIntent ?? false;

  const trueCold =
    !warmIntent &&
    durableRestorable < 3 &&
    restorable < 3 &&
    !hydrated &&
    !deferred &&
    !preparing &&
    input.visibleCount === 0 &&
    !input.listReady;

  const warm = !trueCold;
  const showShuffleLoading = trueCold && input.loading && !input.listReady && input.visibleCount === 0;
  const showShuffleFeed = warm || input.visibleCount > 0 || input.listReady || hydrated || restorable >= 3;

  return { trueCold, warm, showShuffleLoading, showShuffleFeed };
}

// INVARIANT A — warm feed cannot go FEED → LOADING
{
  const before = deriveCold({ loading: false, listReady: true, visibleCount: 42 }, {
    restorableSlots: 42,
    durableRestorable: 42,
    hydrated: true,
    deferred: true,
    preparing: true,
    warmIntent: true,
  });
  assert.equal(before.showShuffleFeed, true);
  assert.equal(before.showShuffleLoading, false);

  const transient = deriveCold({ loading: true, listReady: false, visibleCount: 0 }, {
    restorableSlots: 42,
    durableRestorable: 35,
    hydrated: false,
    deferred: false,
    preparing: false,
    warmIntent: true,
  });
  assert.equal(transient.showShuffleLoading, false, "warm hop must not paint loading shell");
  assert.equal(transient.showShuffleFeed, true, "warm hop must keep feed path");
}

// INVARIANT 0 — durable restore at hop start blocks cold even when transient signals are false
{
  const frame3Bypass = deriveCold(
    { loading: true, listReady: false, visibleCount: 0 },
    {
      restorableSlots: 0,
      durableRestorable: 35,
      hydrated: false,
      deferred: false,
      preparing: false,
      warmIntent: true,
    },
  );
  assert.equal(frame3Bypass.trueCold, false, "warm intent must block trueCold");
  assert.equal(frame3Bypass.warm, true);
  assert.equal(frame3Bypass.showShuffleLoading, false, "frame-3 bypass must not show loading");

  const afterRestore = deriveCold(
    { loading: false, listReady: true, visibleCount: 35 },
    {
      restorableSlots: 35,
      durableRestorable: 35,
      hydrated: true,
      deferred: false,
      preparing: false,
      warmIntent: true,
    },
  );
  assert.equal(afterRestore.showShuffleFeed, true);
  assert.equal(afterRestore.showShuffleLoading, false);
}

// INVARIANT B — cold only when no durable warm snapshot and no warm intent
{
  const cold = deriveCold({ loading: true, listReady: false, visibleCount: 0 }, {
    restorableSlots: 0,
    durableRestorable: 0,
    hydrated: false,
    deferred: false,
    preparing: false,
    warmIntent: false,
  });
  assert.equal(cold.trueCold, true);
  assert.equal(cold.showShuffleLoading, true);
}

console.log("shuffle-presentation-invariants: OK");
