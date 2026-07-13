/**
 * Module reinit route bridge harness — 10000 permutations.
 * Run: node scripts/main-tab-shuffle-module-reinit-route-bridge.harness.mjs
 */

import assert from "node:assert/strict";
import {
  PROD_HOP1_MODULE_REINIT_MS,
  runModuleReinitHarness,
  simulateModuleReinitHop,
  simulateSoftPushReinitWithPinnedTx,
} from "./main-tab-shuffle-module-reinit-route-bridge-core.mjs";

const prodHop = simulateModuleReinitHop({
  m2DelayMs: PROD_HOP1_MODULE_REINIT_MS,
  routeCommitMs: 597,
  finalDomDelayMs: 203,
  legacyRevealAtMs: 770,
});

assert.equal(prodHop.pass, true, `prod hop repro failed: ${JSON.stringify(prodHop, null, 2)}`);
assert.equal(prodHop.handoffCount, 1, "expected single final handoff");
assert.equal(prodHop.txCleared, true, "expected canonical tx clear");
assert.equal(prodHop.legacyBlocked, 1, "legacy reveal must be blocked after M2 adoption");

const softPushPinned = simulateSoftPushReinitWithPinnedTx();
assert.equal(softPushPinned.pass, true, "SOFT_PUSH_REINIT_WITH_PINNED_TX must pass");
assert.equal(softPushPinned.SOFT_PUSH_REINIT_WITH_PINNED_TX, true);

const { pass, fail, total, failures } = runModuleReinitHarness();
assert.equal(total, 10_000, "expected 10000 permutations");
assert.equal(fail, 0, `module reinit harness failures: ${JSON.stringify(failures.slice(0, 3))}`);
assert.equal(pass, 10_000, "MODULE_REINIT_ROUTE_BRIDGE_HARNESS must be 10000/10000");

console.log(`MODULE_REINIT_ROUTE_BRIDGE_HARNESS = ${pass}/${total} PASS`);
console.log(`SOFT_PUSH_REINIT_WITH_PINNED_TX = PASS`);
console.log(`prod-hop repro: adopted=${prodHop.adopted} staleExit=${prodHop.staleExit} handoff=${prodHop.handoffCount}`);
