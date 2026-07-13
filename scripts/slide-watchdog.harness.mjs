/**
 * SLIDE_WATCHDOG_HARNESS — three-stage — 10000/10000
 * Run: node scripts/slide-watchdog.harness.mjs
 */

import assert from "node:assert/strict";
import {
  END_WATCHDOG_DELAY_MS,
  SLIDE_DURATION_MS,
  SLIDE_FAILSAFE_SLACK_MS,
  runSlideWatchdogHarness,
} from "./slide-watchdog-core.mjs";

assert.equal(SLIDE_DURATION_MS, 110);
assert.equal(SLIDE_FAILSAFE_SLACK_MS, 80);
assert.equal(END_WATCHDOG_DELAY_MS, 190);

const result = runSlideWatchdogHarness();

assert.equal(result.total, 10_000, "expected 10000 permutations");
assert.equal(result.fail, 0, `watchdog harness failures: ${JSON.stringify(result.failures.slice(0, 5))}`);
assert.equal(result.pass, 10_000, "SLIDE_WATCHDOG_HARNESS must be 10000/10000");
assert.equal(result.preempt110, 0, "WATCHDOG_PREEMPTED_EXPECTED_NATIVE_END_FROM_START must be 0");
assert.equal(result.preempt190, 0, "WATCHDOG_PREEMPTED_WITHIN_SLACK_FROM_START must be 0");

console.log(`SLIDE_WATCHDOG_HARNESS = ${result.pass}/${result.total} PASS`);
console.log(
  JSON.stringify(
    {
      endWatchdogScheduled: result.endSched,
      endWatchdogReanchors: result.reanchor,
      nativeEndWins: result.nativeEndWins,
      endWatchdogSettle: result.endWatchdogSettle,
      preStartSettle: result.preStartSettle,
      preWriteSettle: result.preWriteSettle,
      WATCHDOG_PREEMPTED_EXPECTED_NATIVE_END_FROM_START: result.preempt110,
      WATCHDOG_PREEMPTED_WITHIN_SLACK_FROM_START: result.preempt190,
      SLIDE_DURATION_MS,
      SLIDE_FAILSAFE_SLACK_MS,
      END_WATCHDOG_DELAY_MS,
      chosenRule: "LAST_OBSERVED_VALID_START",
    },
    null,
    2,
  ),
);
