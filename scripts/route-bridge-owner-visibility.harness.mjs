/**
 * Route-bridge owner visibility harness — 10,000 timing permutations.
 * Run: node scripts/route-bridge-owner-visibility.harness.mjs
 */

import assert from "node:assert/strict";
import {
  compareOldVsNewHop2Table,
  enumerateRouteBridgeOwnerPermutations,
  runRouteBridgeOwnerVisibilityHarness,
  simulateNewSettleToBridge,
  simulateOldSettleToBridge,
} from "./route-bridge-owner-visibility-core.mjs";

const { pass, fail, total, failures } = runRouteBridgeOwnerVisibilityHarness(
  enumerateRouteBridgeOwnerPermutations(),
);

assert.equal(total, 10_000, "expected 10k permutations");
assert.equal(fail, 0, `route bridge owner harness failures: ${JSON.stringify(failures)}`);
assert.equal(pass, 10_000, "ROUTE_BRIDGE_OWNER_VISIBILITY_HARNESS must be 10000/10000");

const oldHop2 = simulateOldSettleToBridge({ routeCommitMs: 3584, finalDomReadyMs: 100 });
const newHop2 = simulateNewSettleToBridge({ routeCommitMs: 3584, finalDomReadyMs: 100 });
const oldHop1 = simulateOldSettleToBridge({ routeCommitMs: 2645, finalDomReadyMs: 50 });

assert.ok(
  oldHop2.bridgeOwnerNotPresentableFrameCount > 0,
  "OLD hop2 must show bridge owner not presentable frames",
);
assert.equal(
  newHop2.bridgeOwnerNotPresentableFrameCount,
  0,
  "NEW hop2 must have zero bridge owner invalid frames",
);
assert.ok(
  oldHop1.bridgeOwnerNotPresentableFrameCount > 0,
  "OLD hop1 latent bridge owner violation expected",
);

const comparison = compareOldVsNewHop2Table();
console.log("OLD vs NEW hop2:");
console.table(comparison.fields);
console.log(`OLD hop1 latent violation frames: ${comparison.oldHop1Latent.bridgeOwnerNotPresentableFrameCount}`);
console.log(`OLD hop2 violation frames: ${comparison.oldHop2.bridgeOwnerNotPresentableFrameCount}`);
console.log(`ROUTE_BRIDGE_OWNER_VISIBILITY_HARNESS = ${pass}/${total} PASS`);
