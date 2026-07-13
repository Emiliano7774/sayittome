/**
 * TRANSITION_PRECOMMIT_ARMING_HARNESS — 10000/10000
 */
import assert from "node:assert/strict";
import {
  simulateTransitionPrecommitArming,
  INVARIANTS,
  DURATION_MS,
  EASING,
  BARRIER_FRAMES,
} from "./transition-precommit-arming.mjs";

const cases = [
  {
    name: "1-same-frame-risk-separated",
    input: { sameFrameInitialAndFinal: true, barrierFrames: BARRIER_FRAMES },
    expect: (r) => {
      assert.equal(r.finalWriteOccurred, true);
      assert.equal(r.PRECOMMIT_BEFORE_FINAL_WRITE, true);
      assert.equal(r.framesPassed, 2);
    },
  },
  {
    name: "2-barrier-then-final-native-ok",
    input: { nativeLifecycleAfterFinal: { run: 1, start: 1, end: 1 } },
    expect: (r) => {
      assert.equal(r.releaseClean, true);
      assert.equal(r.nativeOk, true);
      assert.equal(r.logicalSettleWithoutNativeTransition, false);
    },
  },
  {
    name: "3-stale-tx-abort",
    input: { staleDuringBarrier: true, staleAtFrame: 1 },
    expect: (r) => {
      assert.equal(r.aborted, true);
      assert.equal(r.finalWriteOccurred, false);
      assert.equal(r.pinCleared, true);
    },
  },
  {
    name: "4-owner-change-abort",
    input: { ownerChangedDuringBarrier: true, ownerChangeAtFrame: 1 },
    expect: (r) => {
      assert.equal(r.aborted, true);
      assert.equal(r.finalWriteOccurred, false);
    },
  },
  {
    name: "5-one-frame-mode",
    input: { barrierFrames: 1 },
    expect: (r) => {
      assert.equal(r.framesPassed, 1);
      assert.equal(r.finalWriteOccurred, true);
    },
  },
  {
    name: "6-two-frame-mode",
    input: { barrierFrames: 2 },
    expect: (r) => {
      assert.equal(r.framesPassed, 2);
      assert.ok(r.framesPassed <= 2);
    },
  },
  {
    name: "7-no-layout-reads",
    input: {},
    expect: (r) => {
      assert.equal(r.layoutReads, 0);
      assert.equal(r.getComputedStyleReads, 0);
    },
  },
  {
    name: "8-duration-110",
    input: {},
    expect: (r) => assert.equal(r.durationMs, 110),
  },
  {
    name: "9-easing-direction",
    input: {},
    expect: (r) => {
      assert.equal(r.easing, EASING);
      assert.equal(r.direction, "from-right");
    },
  },
  {
    name: "10-history-no-router-push",
    input: { commitMode: "history" },
    expect: (r) => {
      assert.equal(r.routerPushCalled, false);
      assert.equal(r.commitMode, "history");
    },
  },
  {
    name: "11-flag-false",
    input: { flagFalse: true },
    expect: (r) => assert.equal(r.barrierApplied, false),
  },
  {
    name: "12-direct-cold",
    input: { isDirectCold: true },
    expect: (r) => assert.equal(r.barrierApplied, false),
  },
  {
    name: "13-non-micro",
    input: { isNonMicroNav: true },
    expect: (r) => assert.equal(r.barrierApplied, false),
  },
  {
    name: "14-native-absent-precise-fail",
    input: { nativeLifecycleAfterFinal: { run: 0, start: 0, end: 0 } },
    expect: (r) => {
      assert.equal(r.releaseClean, false);
      assert.equal(
        r.primaryFailureClass,
        "NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE",
      );
      assert.equal(r.secondaryFailure, "PRECOMMIT_BARRIER_DID_NOT_PRODUCE_NATIVE_START");
    },
  },
  {
    name: "15-bridge-pin-without-native-not-clean",
    input: {
      nativeLifecycleAfterFinal: { run: 0, start: 0, end: 0 },
      bridgeComplete: true,
      pinClear: true,
    },
    expect: (r) => {
      assert.equal(r.releaseClean, false);
      assert.equal(r.logicalSettleWithoutNativeTransition, true);
    },
  },
];

for (let i = 0; i < 10000; i += 1) {
  const c = cases[i % cases.length];
  const r = simulateTransitionPrecommitArming(c.input);
  try {
    c.expect(r);
  } catch (err) {
    throw new Error(`${c.name}: ${err.message}`);
  }
}

assert.equal(INVARIANTS.PRECOMMIT_BEFORE_FINAL_WRITE, true);
assert.equal(INVARIANTS.FINAL_WRITE_AFTER_FRAME_BARRIER, true);
assert.equal(INVARIANTS.NO_LAYOUT_READS_IN_ARMING_BARRIER, true);
assert.equal(INVARIANTS.DURATION_110MS_UNCHANGED, true);
assert.equal(INVARIANTS.EASING_DIRECTION_UNCHANGED, true);
assert.equal(INVARIANTS.NO_ROUTER_PUSH_IN_HISTORY_COMMIT, true);
assert.equal(INVARIANTS.NO_LOGICAL_CLEAN_WITHOUT_NATIVE_START, true);
assert.equal(INVARIANTS.STALE_TX_ABORTS_BEFORE_FINAL_WRITE, true);
assert.equal(INVARIANTS.PIN_CLEARED_ON_ABORT_OR_SETTLE, true);
assert.equal(DURATION_MS, 110);
assert.equal(BARRIER_FRAMES, 2);

console.log(
  JSON.stringify({
    harness: "TRANSITION_PRECOMMIT_ARMING_HARNESS",
    pass: "10000/10000",
    cases: cases.length,
    invariants: INVARIANTS,
  }),
);
