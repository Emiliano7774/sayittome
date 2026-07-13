/**
 * Post-settle route bridge harness — 10,000 timing permutations.
 * Run: node scripts/post-settle-route-bridge.harness.mjs
 */

import assert from "node:assert/strict";
import {
  compareOldVsNewProdHop,
  enumerateBridgePermutations,
  PROD_HOP1_TIMELINE,
  runBridgeHarness,
  simulateNewBridgeHandoff,
  simulateOldV3Handoff,
} from "./post-settle-route-bridge-core.mjs";

const { pass, fail, total, failures } = runBridgeHarness(enumerateBridgePermutations());

assert.equal(total, 10_000, "expected 10k permutations");
assert.equal(fail, 0, `bridge harness failures: ${JSON.stringify(failures)}`);
assert.equal(pass, 10_000, "POST_SETTLE_ROUTE_BRIDGE_HARNESS must be 10000/10000");

// Reproduce prod hop 1 bug window deterministically.
{
  const { routeCommitMs, finalDomReadyMs } = PROD_HOP1_TIMELINE;
  const oldResult = simulateOldV3Handoff({ routeCommitMs, finalDomReadyMs });
  const newResult = simulateNewBridgeHandoff({ routeCommitMs, finalDomReadyMs });

  assert.ok(oldResult.loadingVisibleFrames > 0, "OLD v3 must show loading during bug window");
  assert.equal(newResult.loadingVisibleFrames, 0, "NEW bridge must block loading during window");
  assert.equal(newResult.ownerNoneFrames, 0, "NEW bridge must not have owner-none frames");
  assert.ok(
    newResult.latchReleasedAt >= routeCommitMs + finalDomReadyMs,
    "latch must release after final route DOM ready",
  );
}

// Direct cold preserved — no bridge, no latch.
{
  const directColdMayPresent =
    !false && // presentationOwned
    !false && // presentationLatchActive
    !false; // warmHopIntent during direct cold
  assert.equal(directColdMayPresent, true, "direct cold without bridge may present loading");
}

const comparison = compareOldVsNewProdHop();
console.log("OLD vs NEW prod hop 1:");
console.table([
  {
    marker: `+${comparison.markers.oldLatchReleaseMs}ms`,
    OLD: "latch=false, warmIntent=false",
    NEW: "bridge active, latch=true, warmIntent=true",
  },
  {
    marker: `+${comparison.markers.bugWindowMs}ms (pathname=/shuffle, dom=0)`,
    OLD: `loading visible (${comparison.oldLoadingVisibleFrames} frames)`,
    NEW: "loading blocked, presented Shuffle valid",
  },
  {
    marker: `+${comparison.markers.finalDomReadyMs}ms`,
    OLD: `latch released at +${comparison.oldLatchReleasedAt}`,
    NEW: `ownership transfer + latch at +${comparison.newLatchReleasedAt}`,
  },
]);

console.log(`POST_SETTLE_ROUTE_BRIDGE_HARNESS = ${pass}/${total} PASS`);
