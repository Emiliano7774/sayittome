/**
 * NATIVE_TRANSITION_START_GATE_HARNESS — 10000/10000
 * Tooling/classifier only. No product motor changes.
 */
import assert from "node:assert/strict";
import {
  evaluateNativeTransitionStartGate,
  classifyNativeTransitionPhysicalFailure,
  extractFinalWriteEvidence,
  PRIMARY_STATUS,
  INVARIANTS,
  PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST,
} from "./native-transition-start-gate.mjs";
import { evaluateNoScreencastPhysicalEvidence } from "./native-lifecycle-no-screencast-evidence.mjs";
import { releaseHopCleanWithMultisource } from "./shuffle-slide-multisource-classifier.mjs";

function teEvents({ run = 1, start = 1, end = 1, cancel = 0, elapsed = 0.11 } = {}) {
  const events = [];
  for (let i = 0; i < run; i += 1) {
    events.push({ type: "transitionrun", propertyName: "transform", elapsedTime: 0 });
  }
  for (let i = 0; i < start; i += 1) {
    events.push({ type: "transitionstart", propertyName: "transform", elapsedTime: 0 });
  }
  for (let i = 0; i < end; i += 1) {
    events.push({ type: "transitionend", propertyName: "transform", elapsedTime: elapsed });
  }
  for (let i = 0; i < cancel; i += 1) {
    events.push({ type: "transitioncancel", propertyName: "transform", elapsedTime: 0.05 });
  }
  return events;
}

function validFinalWriteTrace({
  sourceBefore = "translate3d(0px, 0px, 0px)",
  sourceAfter = "translate3d(-100%, 0px, 0px)",
  destBefore = "translate3d(100%, 0px, 0px)",
  destAfter = "translate3d(0px, 0px, 0px)",
  css = "transform 110ms cubic-bezier(0.2, 0.72, 0.2, 1)",
  connected = true,
  listenerHost = "shuffle-host-1",
  destId = "shuffle-host-1",
  sourceId = "shuffle-host-2",
} = {}) {
  return [
    { kind: "PHASE_ARMED" },
    { kind: "PHASE_SLIDING" },
    {
      kind: "TRANSITION_LISTENER_ATTACHED",
      hostInstanceId: listenerHost,
    },
    {
      kind: "SLIDE_FINAL_TRANSFORMS_WRITE_ATTEMPT",
      sourceNodeId: sourceId,
      destinationNodeId: destId,
      sourceBeforeInlineTransform: sourceBefore,
      destinationBeforeInlineTransform: destBefore,
      sourceTargetTransform: sourceAfter,
      destinationTargetTransform: destAfter,
      sourceInlineTransition: css,
      hostInstanceId: destId,
    },
    {
      kind: "SLIDE_FINAL_TRANSFORMS_WRITE_RETURNED",
      sourceNodeId: sourceId,
      destinationNodeId: destId,
      sourceAfterInlineTransform: sourceAfter,
      destinationAfterInlineTransform: destAfter,
      sourceAfterInlineTransition: css,
      destinationAfterInlineTransition: css,
      sourceIsConnected: connected,
      destinationIsConnected: connected,
    },
    { kind: "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL" },
  ];
}

const baseLogical = {
  engineSlideOccurred: true,
  domSlideOccurred: true,
  currentHopEvaluationStatus: "FULL_TX_RESOLVED",
  bridgeCompleted: true,
  pinCleared: true,
  provider: PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST,
};

const cases = [
  {
    name: "1-valid-lifecycle-clean",
    input: {
      ...baseLogical,
      hopTrace: [
        ...validFinalWriteTrace(),
        { kind: "SETTLED", reason: "transitionend", note: "transitionend" },
        { kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED" },
        { kind: "MICRO_SLIDE_TX_PIN_CLEARED" },
      ],
      transitionEvents: teEvents(),
      nativeLifecycleSummary: {
        transitionrunCount: 1,
        transitionstartCount: 1,
        transitionendCount: 1,
        transitioncancelCount: 0,
        transitionendElapsedTime: 0.11,
        settleReason: "transitionend",
      },
    },
    expect: {
      clean: true,
      primary: null,
      physical: true,
      logicalWithoutNative: false,
    },
  },
  {
    name: "2-valid-write-lifecycle-000",
    input: {
      ...baseLogical,
      hopTrace: [
        ...validFinalWriteTrace(),
        {
          kind: "SETTLE_INITIATED",
          reason: "transition-never-started-after-final-write",
          settleReason: "transition-never-started-after-final-write",
        },
        {
          kind: "SETTLED",
          note: "transition-never-started-after-final-write",
          reason: "transition-never-started-after-final-write",
        },
        { kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED" },
        { kind: "MICRO_SLIDE_TX_PIN_CLEARED" },
      ],
      transitionEvents: [],
      nativeLifecycleSummary: {
        transitionrunCount: 0,
        transitionstartCount: 0,
        transitionendCount: 0,
        transitioncancelCount: 0,
        settleReason: "transition-never-started-after-final-write",
      },
      noScreencastPhysicalEvidenceValid: false,
    },
    expect: {
      clean: false,
      primary: PRIMARY_STATUS.NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE,
      physical: false,
      logicalWithoutNative: true,
      specific: "transition-never-started-after-final-write",
    },
  },
  {
    name: "3-bridge-pin-without-native",
    input: {
      ...baseLogical,
      hopTrace: [
        ...validFinalWriteTrace(),
        { kind: "SETTLED", note: "transition-never-started-after-final-write" },
        { kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED" },
        { kind: "MICRO_SLIDE_TX_PIN_CLEARED" },
      ],
      transitionEvents: [],
      noScreencastPhysicalEvidenceValid: false,
    },
    expect: {
      clean: false,
      physical: false,
      logicalWithoutNative: true,
      primary: PRIMARY_STATUS.NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE,
    },
  },
  {
    name: "4-final-write-no-delta",
    input: {
      ...baseLogical,
      hopTrace: [
        ...validFinalWriteTrace({
          sourceBefore: "translate3d(0px, 0px, 0px)",
          sourceAfter: "translate3d(0px, 0px, 0px)",
          destBefore: "translate3d(0px, 0px, 0px)",
          destAfter: "translate3d(0px, 0px, 0px)",
        }),
        { kind: "SETTLED", note: "transitionend" },
      ],
      transitionEvents: [],
      noScreencastPhysicalEvidenceValid: false,
      finalWriteOverrides: {
        transformDeltaNonzero: false,
        targetAlreadyAtFinal: false,
        finalWriteValid: false,
      },
    },
    expect: {
      clean: false,
      primary: PRIMARY_STATUS.FINAL_WRITE_DID_NOT_CHANGE_TRANSFORM,
      physical: false,
    },
  },
  {
    name: "5-target-already-final",
    input: {
      ...baseLogical,
      hopTrace: validFinalWriteTrace({
        sourceBefore: "translate3d(-100%, 0px, 0px)",
        sourceAfter: "translate3d(-100%, 0px, 0px)",
        destBefore: "translate3d(0px, 0px, 0px)",
        destAfter: "translate3d(0px, 0px, 0px)",
      }),
      transitionEvents: [],
      noScreencastPhysicalEvidenceValid: false,
      finalWriteOverrides: {
        targetAlreadyAtFinal: true,
        transformDeltaNonzero: false,
        finalWriteValid: false,
      },
    },
    expect: {
      clean: false,
      primary: PRIMARY_STATUS.TARGET_ALREADY_AT_FINAL_TRANSFORM,
    },
  },
  {
    name: "6-css-missing",
    input: {
      ...baseLogical,
      hopTrace: validFinalWriteTrace({ css: "none" }),
      transitionEvents: [],
      noScreencastPhysicalEvidenceValid: false,
      finalWriteOverrides: { cssTransitionApplied: false, finalWriteValid: false },
    },
    expect: {
      clean: false,
      primary: PRIMARY_STATUS.CSS_TRANSITION_NOT_APPLIED_AFTER_FINAL_WRITE,
    },
  },
  {
    name: "7-target-not-renderable",
    input: {
      ...baseLogical,
      hopTrace: validFinalWriteTrace({ connected: false }),
      transitionEvents: [],
      noScreencastPhysicalEvidenceValid: false,
      finalWriteOverrides: { targetRenderable: false, finalWriteValid: false },
    },
    expect: {
      clean: false,
      primary: PRIMARY_STATUS.TRANSITION_TARGET_NOT_RENDERABLE_AT_FINAL_WRITE,
    },
  },
  {
    name: "8-listener-mismatch",
    input: {
      ...baseLogical,
      hopTrace: validFinalWriteTrace({ listenerHost: "wrong-host", destId: "shuffle-host-1" }),
      transitionEvents: [],
      noScreencastPhysicalEvidenceValid: false,
      finalWriteOverrides: { listenerTargetMatched: false, finalWriteValid: false },
    },
    expect: {
      clean: false,
      primary: PRIMARY_STATUS.NATIVE_TRANSITION_PROVIDER_TARGET_MISMATCH,
    },
  },
  {
    name: "9-start-yes-end-no",
    input: {
      ...baseLogical,
      hopTrace: [
        ...validFinalWriteTrace(),
        { kind: "SETTLED", note: "post-transition-start-end-watchdog", reason: "post-transition-start-end-watchdog" },
      ],
      transitionEvents: teEvents({ end: 0, cancel: 1 }),
      nativeLifecycleSummary: {
        transitionrunCount: 1,
        transitionstartCount: 1,
        transitionendCount: 0,
        transitioncancelCount: 1,
        settleReason: "post-transition-start-end-watchdog",
      },
      noScreencastPhysicalEvidenceValid: false,
    },
    expect: {
      clean: false,
      primary: PRIMARY_STATUS.NATIVE_TRANSITION_STARTED_BUT_DID_NOT_END,
    },
  },
  {
    name: "10-end-without-run-start",
    input: {
      ...baseLogical,
      hopTrace: [
        ...validFinalWriteTrace(),
        { kind: "SETTLED", reason: "transitionend", note: "transitionend" },
      ],
      transitionEvents: teEvents({ run: 0, start: 0, end: 1 }),
      nativeLifecycleSummary: {
        transitionrunCount: 0,
        transitionstartCount: 0,
        transitionendCount: 1,
        transitioncancelCount: 0,
        transitionendElapsedTime: 0.11,
        settleReason: "transitionend",
      },
      noScreencastPhysicalEvidenceValid: false,
    },
    expect: {
      clean: false,
      primary: PRIMARY_STATUS.NATIVE_TRANSITION_END_WITHOUT_RUN_OR_START,
    },
  },
  {
    name: "11-history-commit-valid-clean",
    input: {
      ...baseLogical,
      commitMode: "history",
      currentHopEvaluationStatus: "FULL_TX_RESOLVED_HISTORY_COMMIT",
      hopTrace: [
        ...validFinalWriteTrace(),
        { kind: "SETTLED", reason: "transitionend", note: "transitionend" },
        { kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED" },
        { kind: "MICRO_SLIDE_TX_PIN_CLEARED" },
      ],
      transitionEvents: teEvents(),
      nativeLifecycleSummary: {
        transitionrunCount: 1,
        transitionstartCount: 1,
        transitionendCount: 1,
        transitioncancelCount: 0,
        transitionendElapsedTime: 0.11,
        settleReason: "transitionend",
      },
    },
    expect: { clean: true, physical: true, primary: null },
  },
  {
    name: "12-history-commit-missing-native",
    input: {
      ...baseLogical,
      commitMode: "history",
      currentHopEvaluationStatus: "FULL_TX_RESOLVED_HISTORY_COMMIT",
      hopTrace: [
        ...validFinalWriteTrace(),
        {
          kind: "SETTLED",
          note: "transition-never-started-after-final-write",
          reason: "transition-never-started-after-final-write",
        },
        { kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED" },
        { kind: "MICRO_SLIDE_TX_PIN_CLEARED" },
      ],
      transitionEvents: [],
      noScreencastPhysicalEvidenceValid: false,
    },
    expect: {
      clean: false,
      primary: PRIMARY_STATUS.NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE,
      physical: false,
    },
  },
  {
    name: "13-archive-full-tx-live-physical-missing",
    input: {
      ...baseLogical,
      currentHopEvaluationStatus: "FULL_TX_RESOLVED_FROM_ARCHIVE",
      hopTrace: [
        ...validFinalWriteTrace(),
        { kind: "SETTLED", note: "transition-never-started-after-final-write" },
      ],
      transitionEvents: [],
      noScreencastPhysicalEvidenceValid: false,
    },
    expect: {
      clean: false,
      physical: false,
      logicalWithoutNative: true,
    },
  },
  {
    name: "14-no-screencast-no-raf-required",
    input: {
      ...baseLogical,
      hopTrace: [
        ...validFinalWriteTrace(),
        { kind: "SETTLED", reason: "transitionend", note: "transitionend" },
      ],
      transitionEvents: teEvents(),
      nativeLifecycleSummary: {
        transitionrunCount: 1,
        transitionstartCount: 1,
        transitionendCount: 1,
        transitioncancelCount: 0,
        transitionendElapsedTime: 0.11,
        settleReason: "transitionend",
      },
    },
    expect: {
      clean: true,
      physical: true,
      noRaf: true,
    },
  },
  {
    name: "15-visual-provider-preserved",
    input: {
      ...baseLogical,
      visualProvider: true,
      provider: "CDP_SCREENCAST_VISUAL_SPOT_CHECK",
      releaseBaseClean: true,
      hopTrace: [],
      transitionEvents: [],
    },
    expect: {
      clean: true,
      physicalRequired: false,
      visualPreserved: true,
    },
  },
];

function runCase(c) {
  const gate = evaluateNativeTransitionStartGate(c.input);
  if (c.expect.clean != null) {
    assert.equal(gate.releaseHopClean, c.expect.clean, `${c.name} clean`);
  }
  if (c.expect.primary !== undefined) {
    assert.equal(gate.primaryFailureClass, c.expect.primary, `${c.name} primary`);
  }
  if (c.expect.physical != null) {
    assert.equal(
      gate.physicalNativeTransitionSatisfied,
      c.expect.physical,
      `${c.name} physical`,
    );
  }
  if (c.expect.logicalWithoutNative != null) {
    assert.equal(
      gate.logicalSettleWithoutNativeTransition,
      c.expect.logicalWithoutNative,
      `${c.name} logicalWithoutNative`,
    );
  }
  if (c.expect.specific) {
    assert.equal(gate.specificTransitionFailure, c.expect.specific, `${c.name} specific`);
  }
  if (c.expect.noRaf) {
    assert.equal(gate.invariants.NO_RAF_SAMPLE_REQUIRED_FOR_NATIVE_PROVIDER, true);
  }
  if (c.expect.physicalRequired === false) {
    assert.equal(gate.physicalNativeTransitionRequired, false);
  }
  if (c.expect.visualPreserved) {
    assert.equal(gate.visualProviderPreserved, true);
  }

  // Evidence helper still rejects TE-without-run/start
  if (c.name === "10-end-without-run-start") {
    const ev = evaluateNoScreencastPhysicalEvidence({
      engineSlideOccurred: true,
      domSlideOccurred: true,
      finalInlineTargetCommitted: true,
      transitionEvents: c.input.transitionEvents,
      hopTrace: c.input.hopTrace,
      settleReason: "transitionend",
    });
    assert.equal(ev.NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID, false);
  }

  if (c.name === "2-valid-write-lifecycle-000") {
    const re = releaseHopCleanWithMultisource({
      baseChecks: {
        COMPLETE_HOP_CAPTURE: true,
        MICRO_SLIDE_LIFECYCLE_VALID: true,
        FIRST_VISUAL_CHANGE_FROM_SOURCE: true,
        FIRST_POST_SLIDE_SURFACE: true,
        tailFramesAfterSecondValid: 20,
        postSettleBridgeLifecycleValid: true,
        BRIDGE_OWNER_SURFACE_PRESENTABLE: true,
        bridgeOwnerNotPresentableFrameCount: 0,
      },
      multisource: {
        ENGINE_SLIDE_OCCURRED: true,
        DOM_SLIDE_OCCURRED: true,
        PHYSICAL_TRANSFORM_OCCURRED: false,
        classification: "TRANSFORM_NOT_ANIMATED",
        hardFail: true,
        hopTrace: c.input.hopTrace,
        TRACE_BELONGS_TO_CURRENT_HOP: true,
        currentHopTransactionIdResolved: "tx-1",
      },
      requireBridge: true,
      nativeLifecycleNoScreencast: true,
      noScreencastPhysicalEvidenceValid: false,
      minimalReleaseFields: {
        traceBelongsToCurrentHop: true,
        currentHopTransactionResolved: true,
        ENGINE_SLIDE_OCCURRED: true,
        DOM_SLIDE_OCCURRED: true,
        finalInlineTargetCommitted: true,
        SETTLED: true,
        bridgeStarted: true,
        bridgeOwnerPresentable: true,
        finalRouteReady: true,
        ownershipTransferred: true,
        latchReleasedFinalRouteReady: true,
        canonicalTransactionCleared: false,
        bridgeCompleted: true,
      },
      absoluteExtras: {
        transitionEvents: [],
        currentHopEvaluationStatus: "FULL_TX_RESOLVED",
        pinCleared: true,
      },
    });
    assert.equal(re.releaseHopClean, false);
    assert.equal(
      re.nativeStartGate?.primaryFailureClass,
      PRIMARY_STATUS.NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE,
    );
  }
}

for (let i = 0; i < 10000; i += 1) {
  runCase(cases[i % cases.length]);
}

assert.equal(INVARIANTS.FULL_TX_RESOLVED_DOES_NOT_IMPLY_PHYSICAL_CLEAN, true);
assert.equal(INVARIANTS.BRIDGE_COMPLETE_DOES_NOT_IMPLY_PHYSICAL_CLEAN, true);
assert.equal(INVARIANTS.PIN_CLEAR_DOES_NOT_IMPLY_PHYSICAL_CLEAN, true);
assert.equal(INVARIANTS.NO_NATIVE_START_NEVER_CLEAN, true);
assert.equal(INVARIANTS.VALID_FINAL_WRITE_WITH_NO_NATIVE_START_CLASSIFIED_PRECISELY, true);
assert.equal(INVARIANTS.START_YES_END_NO_CLASSIFIED_SEPARATELY, true);
assert.equal(INVARIANTS.NO_RAF_SAMPLE_REQUIRED_FOR_NATIVE_PROVIDER, true);
assert.equal(INVARIANTS.HISTORY_COMMIT_STILL_REQUIRES_NATIVE_TRANSITION, true);

// start-yes/end-no classified separately from never-started
const startYes = classifyNativeTransitionPhysicalFailure({
  finalWrite: {
    finalWriteValid: true,
    finalInlineTargetCommitted: true,
    transformDeltaNonzero: true,
    cssTransitionApplied: true,
  },
  lifecycle: {
    nativeTransitionRunCount: 1,
    nativeTransitionStartCount: 1,
    nativeTransitionEndCount: 0,
    nativeTransitionCancelCount: 0,
    settleReason: "post-transition-start-end-watchdog",
  },
  physicalSatisfied: false,
});
assert.equal(
  startYes.primaryFailureClass,
  PRIMARY_STATUS.NATIVE_TRANSITION_STARTED_BUT_DID_NOT_END,
);

const never = classifyNativeTransitionPhysicalFailure({
  finalWrite: {
    finalWriteValid: true,
    finalInlineTargetCommitted: true,
    transformDeltaNonzero: true,
    cssTransitionApplied: true,
  },
  lifecycle: {
    nativeTransitionRunCount: 0,
    nativeTransitionStartCount: 0,
    nativeTransitionEndCount: 0,
    nativeTransitionCancelCount: 0,
    neverStartedAfterFinalWrite: true,
    settleReason: "transition-never-started-after-final-write",
  },
  physicalSatisfied: false,
});
assert.equal(
  never.primaryFailureClass,
  PRIMARY_STATUS.NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE,
);

const fw = extractFinalWriteEvidence(validFinalWriteTrace());
assert.equal(fw.styleSnapshot.FINAL_WRITE_STYLE_SNAPSHOT_NON_PERTURBING, true);
assert.equal(fw.styleSnapshot.getComputedStyleDuringCriticalWindow, false);
assert.equal(fw.styleSnapshot.layoutReadsDuringCriticalWindow, false);

console.log(
  JSON.stringify({
    harness: "NATIVE_TRANSITION_START_GATE_HARNESS",
    iterations: 10000,
    cases: cases.length,
    pass: "10000/10000",
    invariants: INVARIANTS,
  }),
);
