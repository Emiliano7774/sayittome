/**
 * MAIN_TAB_SHUFFLE_SOFT_PUSH_REINIT_TX_PIN_HARNESS — 10000/10000
 */
import assert from "node:assert/strict";
import { runSoftPushReinitPinHarness } from "./main-tab-shuffle-soft-push-reinit-tx-pin-core.mjs";

const { pass, fail, total, failures, invariants } = runSoftPushReinitPinHarness(10_000);
assert.equal(total, 10_000);
assert.equal(fail, 0, `failures: ${JSON.stringify(failures.slice(0, 5))}`);
assert.equal(pass, 10_000);
assert.equal(invariants.PINNED_TX_REHYDRATES_AFTER_SAME_DOCUMENT_REINIT, true);
assert.equal(invariants.PINNED_TX_NOT_REHYDRATED_AFTER_FULL_DOCUMENT_RELOAD, true);
assert.equal(invariants.LEGACY_REVEAL_BLOCKED_WHILE_PINNED_TX_IN_FLIGHT, true);
assert.equal(invariants.PIN_CLEARED_AFTER_SETTLE_OR_ABORT, true);
assert.equal(invariants.NO_DUPLICATE_ACTIVE_TX_AFTER_REHYDRATION, true);
assert.equal(invariants.TX_ID_STABLE_ACROSS_REINIT, true);

console.log(`MAIN_TAB_SHUFFLE_SOFT_PUSH_REINIT_TX_PIN_HARNESS = ${pass}/${total} PASS`);
console.log(JSON.stringify(invariants));
