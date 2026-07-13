/**
 * HISTORY_BACK_FORWARD_PIN_GUARD_HARNESS — 100000/100000
 */
import assert from "node:assert/strict";
import { runHistoryBackForwardPinGuardHarness } from "./history-back-forward-pin-guard-core.mjs";

const { pass, fail, total, failures, invariants } = runHistoryBackForwardPinGuardHarness(100_000);
assert.equal(total, 100_000);
assert.equal(fail, 0, `failures: ${JSON.stringify(failures.slice(0, 8))}`);
assert.equal(pass, 100_000);
assert.equal(invariants.NO_PIN_WITHOUT_ACTIVE_TX, true);
assert.equal(invariants.POPSTATE_NEVER_CREATES_MICRO_SLIDE_TX, true);
assert.equal(invariants.BACK_FORWARD_RESTORE_DOES_NOT_CONSUME_CLICK_INTENT, true);
assert.equal(invariants.USER_CLICK_STILL_CREATES_VALID_TX, true);
assert.equal(invariants.INTERNAL_PATHNAME_UPDATE_DOES_NOT_START_TRANSITION, true);
assert.equal(invariants.BOTTOM_NAV_STATE_UPDATE_DOES_NOT_START_TRANSITION, true);
assert.equal(invariants.STALE_PIN_TX_NULL_CLEARED, true);
assert.equal(invariants.DIRECT_COLD_UNCHANGED, true);
assert.equal(invariants.FLAG_FALSE_UNCHANGED, true);
assert.equal(invariants.NON_MICRO_HARD_NAV_UNCHANGED, true);

console.log(`HISTORY_BACK_FORWARD_PIN_GUARD_HARNESS = ${pass}/${total} PASS`);
console.log(JSON.stringify(invariants));
