/**
 * PROD_HOP_WAAPI_CLASSIFIER_HARNESS — 100000 iterations.
 * Tooling only.
 */
import assert from "node:assert/strict";
import {
  classifyProdHopDetailed,
  countRealProdHopInputs,
  detectProdHopMotor,
} from "./prod-hop-waapi-classifier.mjs";

const ITERATIONS = 100_000;

function baseSoftDiag() {
  return [
    { kind: "MICRO_SLIDE_HISTORY_NAVIGATION_REQUIRED" },
    { kind: "MICRO_SLIDE_HARD_NAVIGATION_BYPASSED" },
    { kind: "MICRO_SLIDE_HISTORY_PUSHSTATE_CALLED" },
    { kind: "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT" },
    { kind: "MICRO_SLIDE_TX_SOFT_COMMIT_IN_FLIGHT" },
    { kind: "MICRO_SLIDE_TX_PIN_CLEARED" },
  ];
}

function baseTrace(extra = []) {
  return [
    { kind: "PHASE_ARMED", monoMs: 1 },
    { kind: "PHASE_SLIDING", monoMs: 2 },
    { kind: "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL", monoMs: 3 },
    { kind: "POST_SETTLE_ROUTE_BRIDGE_STARTED", monoMs: 20 },
    { kind: "FINAL_ROUTE_SURFACE_READY", monoMs: 21 },
    { kind: "PRESENTATION_OWNERSHIP_TRANSFERRED", monoMs: 22 },
    { kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED", monoMs: 23 },
    ...extra,
  ];
}

function waapiPromotedTrace() {
  return baseTrace([
    { kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED", monoMs: 4 },
    { kind: "MICRO_SLIDE_WAAPI_KEYFRAMES_PREPARED", monoMs: 5 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CREATED", monoMs: 6 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_READY", monoMs: 7 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_STARTED", monoMs: 8 },
    { kind: "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_ACCEPTED", monoMs: 9 },
    {
      kind: "MICRO_SLIDE_WAAPI_FINISHED_PROMOTED_BY_WATCHDOG",
      monoMs: 10,
      physicalSatisfiedAfterEvent: true,
    },
    { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED", monoMs: 11 },
    { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_SATISFIED_CANONICAL", monoMs: 12 },
  ]);
}

function waapiNativeTrace() {
  return baseTrace([
    { kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED", monoMs: 4 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CREATED", monoMs: 5 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_READY", monoMs: 6 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_STARTED", monoMs: 7 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED", monoMs: 8, reason: "native-finished" },
    { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED", monoMs: 9 },
    { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED", monoMs: 10 },
  ]);
}

function makeHop({
  hopTrace = waapiPromotedTrace(),
  settleReason = "waapi-watchdog-promoted-finish",
  transitionrunCount = 0,
  transitionstartCount = 0,
  transitionendCount = 0,
  transitioncancelCount = 0,
  watchdogSettleCount = 0,
  watchdogCallbackCount = 0,
  loadingShellVisibleFrameCount = 0,
  visibleRouteMismatchFrameCount = 0,
  pathname = "/shuffle",
  pointerdown = 1,
  bridgeCompleted = true,
  pinCleared = true,
  RELEASE_HOP_CLEAN = true,
  COMPLETE_HOP_CAPTURE = true,
  blackRootCritical = "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER",
  presentedNoneCritical = "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER",
  softDiag = baseSoftDiag(),
  legacyRevealExecutedCount = 0,
} = {}) {
  const soft = {
    effectiveCommitNavigationMode: "history",
    hardNavigateMicroSlideCount: 0,
    windowLocationAssignCount: 0,
    runtimeRecreatedCount: 0,
    legacyRevealExecutedCount,
  };
  if (!pinCleared) {
    softDiag = softDiag.filter((e) => e.kind !== "MICRO_SLIDE_TX_PIN_CLEARED");
  }
  return {
    sourceTab: "chats",
    COMPLETE_HOP_CAPTURE,
    RELEASE_HOP_CLEAN,
    loadingShellVisibleFrameCount,
    visibleRouteMismatchFrameCount,
    bugWindowFrameCount: 0,
    PHYSICAL_EVIDENCE_PROVIDER_SELECTED: "WAAPI_COMPOSITOR_LIFECYCLE_NO_SCREENCAST",
    blackRootCritical,
    presentedNoneCritical,
    runnerIsolation: { hopPointerdownCount: pointerdown },
    softNavEvidence: soft,
    softNavDiag: softDiag,
    hopNineDiag: {
      softNavDiag: softDiag,
      commitNavigationMode: { effectiveCommitNavigationMode: "history" },
    },
    softNavTraceObservability: {
      pinDiagCaptured: true,
      NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY: true,
      pinDiag: {
        pinHistory: softDiag.filter((e) => String(e.kind).includes("TX_PIN")),
      },
    },
    hopNineEvidence: {
      hopTrace,
      currentHopEvaluationStatus: "FULL_TX_RESOLVED",
      currentHopTransactionIdResolved: "tx-1-1-_chats",
      TRACE_BELONGS_TO_CURRENT_HOP: true,
      ENGINE_SLIDE_OCCURRED: true,
      DOM_SLIDE_OCCURRED: true,
    },
    bridgeAudit: {
      bridgeStarted: true,
      bridgeCompleted,
      finalRouteReady: true,
      ownershipTransferred: true,
      BRIDGE_OWNER_SURFACE_PRESENTABLE: true,
      loadingActuallyVisibleDuringBridge: 0,
    },
    nativeLifecycleNoScreencastEvidence: {
      transitionrunCount,
      transitionstartCount,
      transitionendCount,
      transitioncancelCount,
      settleReason,
    },
    nativeLifecycleSummary: {
      settleReason,
      watchdogSettleCount,
      watchdogCallbackCount,
    },
    postHopOutsideCritical: {
      pathname,
      centeredLoadingVisible: false,
      blankOrRootSuspect: false,
      bottomNavVisible: true,
    },
    criticalCaptureCounters: {
      cdpScreencastStartCountDuringCriticalWindow: 0,
      cdpScreencastFrameCountDuringCriticalWindow: 0,
      pageScreenshotCountDuringCriticalWindow: 0,
      externalCaptureLoopIterationsDuringCriticalWindow: 0,
      rafProbeCountDuringCriticalWindow: 0,
      computedStyleReadCountDuringCriticalWindow: 0,
      layoutReadCountDuringCriticalWindow: 0,
      sessionStorageWriteCountDuringCriticalWindow: 0,
    },
    releaseChecks: {
      watchdogPreemptExpectedNativeEndFromStartCount: 0,
      watchdogPreemptWithinSlackFromStartCount: 0,
    },
  };
}

function makeCssCleanHop() {
  return makeHop({
    hopTrace: baseTrace(),
    settleReason: "transitionend",
    transitionrunCount: 1,
    transitionstartCount: 1,
    transitionendCount: 1,
    transitioncancelCount: 0,
    watchdogSettleCount: 0,
    watchdogCallbackCount: 0,
  });
}

const CASES = [
  {
    name: "1-clean-waapi-promoted-finish",
    expect: "PROD_SINGLE_HOP_CLEAN",
    run: () =>
      classifyProdHopDetailed(makeHop({ hopTrace: waapiPromotedTrace() }), true, true),
  },
  {
    name: "2-clean-waapi-native-finish",
    expect: "PROD_SINGLE_HOP_CLEAN",
    run: () =>
      classifyProdHopDetailed(
        makeHop({
          hopTrace: waapiNativeTrace(),
          settleReason: "waapi-finish",
        }),
        true,
        true,
      ),
  },
  {
    name: "3-waapi-no-physical",
    expect: "PROD_SINGLE_HOP_FAIL",
    run: () => {
      const hopTrace = waapiPromotedTrace().filter(
        (e) =>
          e.kind !== "MICRO_SLIDE_WAAPI_PHYSICAL_SATISFIED_CANONICAL" &&
          e.kind !== "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED",
      );
      for (const e of hopTrace) delete e.physicalSatisfiedAfterEvent;
      return classifyProdHopDetailed(makeHop({ hopTrace }), true, true);
    },
  },
  {
    name: "4-waapi-cancel-before-physical",
    expect: "PROD_SINGLE_HOP_FAIL",
    run: () => {
      const hopTrace = [
        ...waapiPromotedTrace(),
        { kind: "MICRO_SLIDE_WAAPI_CANCEL_BEFORE_PHYSICAL", monoMs: 13 },
      ];
      return classifyProdHopDetailed(makeHop({ hopTrace }), true, true);
    },
  },
  {
    name: "5-waapi-unavailable",
    expect: "PROD_SINGLE_HOP_FAIL",
    run: () => {
      const hopTrace = [
        ...waapiPromotedTrace(),
        { kind: "MICRO_SLIDE_WAAPI_UNAVAILABLE", monoMs: 13 },
      ];
      return classifyProdHopDetailed(makeHop({ hopTrace }), true, true);
    },
  },
  {
    name: "6-waapi-logical-settle-without-physical",
    expect: "PROD_SINGLE_HOP_FAIL",
    run: () => {
      const hopTrace = [
        ...waapiPromotedTrace(),
        { kind: "MICRO_SLIDE_WAAPI_LOGICAL_SETTLE_WITHOUT_PHYSICAL", monoMs: 13 },
      ];
      return classifyProdHopDetailed(makeHop({ hopTrace }), true, true);
    },
  },
  {
    name: "7-waapi-bridge-missing",
    expect: "PROD_SINGLE_HOP_FAIL",
    run: () => {
      const hop = makeHop({ bridgeCompleted: false });
      hop.hopNineEvidence.hopTrace = hop.hopNineEvidence.hopTrace.filter(
        (e) => e.kind !== "POST_SETTLE_ROUTE_BRIDGE_COMPLETED",
      );
      hop.bridgeAudit.bridgeCompleted = false;
      return classifyProdHopDetailed(hop, true, true);
    },
  },
  {
    name: "8-waapi-pin-not-cleared",
    expect: "PROD_SINGLE_HOP_FAIL",
    run: () => classifyProdHopDetailed(makeHop({ pinCleared: false }), true, true),
  },
  {
    name: "9-waapi-final-path-not-shuffle",
    expect: "PROD_SINGLE_HOP_FAIL",
    run: () => classifyProdHopDetailed(makeHop({ pathname: "/chats" }), true, true),
  },
  {
    name: "10-waapi-loading-shell-visible",
    expect: "PROD_SINGLE_HOP_FAIL",
    run: () =>
      classifyProdHopDetailed(makeHop({ loadingShellVisibleFrameCount: 3 }), true, true),
  },
  {
    name: "11-rollback-false-missing",
    expect: "PROD_SINGLE_HOP_FAIL",
    run: () => classifyProdHopDetailed(makeHop(), false, true),
  },
  {
    name: "12-css-mode-clean-transitionend",
    expect: "PROD_SINGLE_HOP_CLEAN",
    run: () => classifyProdHopDetailed(makeCssCleanHop(), true, true),
  },
  {
    name: "13-css-mode-missing-transitionend",
    expect: "PROD_SINGLE_HOP_FAIL",
    run: () =>
      classifyProdHopDetailed(
        makeHop({
          hopTrace: baseTrace(),
          settleReason: "watchdog",
          transitionrunCount: 1,
          transitionstartCount: 1,
          transitionendCount: 0,
          transitioncancelCount: 0,
        }),
        true,
        true,
      ),
  },
  {
    name: "14-waapi-missing-css-transitionend-still-clean",
    expect: "PROD_SINGLE_HOP_CLEAN",
    run: () => {
      const r = classifyProdHopDetailed(
        makeHop({
          hopTrace: waapiPromotedTrace(),
          transitionrunCount: 0,
          transitionstartCount: 0,
          transitionendCount: 0,
          watchdogCallbackCount: 1,
        }),
        true,
        true,
      );
      assert.equal(r.diagnostics.PROD_HOP_CLASSIFIER_WAAPI_MODE, true);
      assert.equal(r.diagnostics.PROD_HOP_CLASSIFIER_CSS_TRANSITION_NOT_REQUIRED_IN_WAAPI, true);
      return r;
    },
  },
  {
    name: "15-secondary-arm-rejected-zero-input-ignored",
    expect: "PROD_SINGLE_HOP_CLEAN",
    run: () => {
      const secondary = {
        PROD_TRUE_INPUT_ARM_REJECTED: true,
        PROD_TRUE_INPUT_ARMED: false,
        runnerIsolation: { hopPointerdownCount: 0 },
        COMPLETE_HOP_CAPTURE: false,
      };
      const r = classifyProdHopDetailed(makeHop({ pointerdown: 1 }), true, true, {
        secondaryHopReports: [secondary],
      });
      assert.equal(r.diagnostics.totalRealInputCount, 1);
      assert.equal(
        r.diagnostics.PROD_HOP_CLASSIFIER_SECONDARY_ARM_REJECTED_NO_INPUT_IGNORED,
        true,
      );
      return r;
    },
  },
  {
    name: "16-two-actual-taps",
    expect: "PROD_MORE_THAN_ONE_INPUT",
    run: () =>
      classifyProdHopDetailed(makeHop({ pointerdown: 1 }), true, true, {
        secondaryHopReports: [
          {
            PROD_TRUE_INPUT_ARM_REJECTED: false,
            runnerIsolation: { hopPointerdownCount: 1 },
          },
        ],
      }),
  },
  {
    name: "17-no-input",
    expect: "PROD_INPUT_NOT_EXECUTED",
    run: () => classifyProdHopDetailed(makeHop({ pointerdown: 0 }), true, true),
  },
  {
    name: "18-black-root-no-screencast-not-evaluated",
    expect: "PROD_SINGLE_HOP_CLEAN",
    run: () => {
      const r = classifyProdHopDetailed(
        makeHop({
          blackRootCritical: "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER",
          presentedNoneCritical: "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER",
        }),
        true,
        true,
      );
      assert.equal(r.diagnostics.NO_FAKE_VISUAL_ZEROS, true);
      assert.ok(String(r.diagnostics.BLACK_ROOT_CRITICAL).includes("NOT_EVALUATED"));
      return r;
    },
  },
];

let pass = 0;
const failures = [];

for (let i = 0; i < ITERATIONS; i += 1) {
  const c = CASES[i % CASES.length];
  try {
    const result = c.run();
    assert.equal(result.status, c.expect, `${c.name} status`);
    // Invariants checked every iteration via representative cases.
    if (c.name === "14-waapi-missing-css-transitionend-still-clean") {
      assert.equal(
        result.diagnostics.PROD_HOP_CLASSIFIER_CSS_TRANSITION_NOT_REQUIRED_IN_WAAPI,
        true,
      );
    }
    if (c.name === "12-css-mode-clean-transitionend") {
      assert.equal(result.diagnostics.PROD_HOP_CLASSIFIER_CSS_MODE, true);
      assert.equal(result.diagnostics.cssTransitionRequired, true);
    }
    if (c.name === "11-rollback-false-missing") {
      assert.equal(result.diagnostics.PROD_HOP_CLASSIFIER_ROLLBACK_FALSE_REQUIRED, true);
    }
    if (c.name === "3-waapi-no-physical") {
      assert.equal(result.diagnostics.waapi?.PROD_HOP_CLASSIFIER_WAAPI_PHYSICAL_ACCEPTED, false);
    }
    if (c.name === "10-waapi-loading-shell-visible") {
      assert.ok((result.diagnostics.loadingShellVisibleFrameCount ?? 0) > 0);
    }
    if (c.name === "16-two-actual-taps") {
      assert.equal(result.diagnostics.TWO_OR_MORE_REAL_INPUTS, true);
    }
    pass += 1;
  } catch (err) {
    failures.push({ i, case: c.name, error: String(err?.message || err) });
    if (failures.length > 20) break;
  }
}

const sampleWaapi = classifyProdHopDetailed(makeHop(), true, true);
const sampleCss = classifyProdHopDetailed(makeCssCleanHop(), true, true);
const inputInfo = countRealProdHopInputs({
  primaryHopReport: makeHop({ pointerdown: 1 }),
  secondaryHopReports: [
    { PROD_TRUE_INPUT_ARM_REJECTED: true, runnerIsolation: { hopPointerdownCount: 0 } },
  ],
});

const invariants = {
  WAAPI_MODE_DOES_NOT_REQUIRE_CSS_TRANSITIONEND:
    sampleWaapi.diagnostics.PROD_HOP_CLASSIFIER_CSS_TRANSITION_NOT_REQUIRED_IN_WAAPI === true &&
    sampleWaapi.status === "PROD_SINGLE_HOP_CLEAN",
  CSS_MODE_STILL_REQUIRES_CSS_TRANSITION_WHEN_APPLICABLE:
    sampleCss.diagnostics.cssTransitionRequired === true &&
    sampleCss.status === "PROD_SINGLE_HOP_CLEAN",
  WAAPI_PHYSICAL_REQUIRED_FOR_CLEAN: (() => {
    const hopTrace = waapiPromotedTrace()
      .filter((e) => e.kind !== "MICRO_SLIDE_WAAPI_PHYSICAL_SATISFIED_CANONICAL")
      .map((e) => {
        const copy = { ...e };
        delete copy.physicalSatisfiedAfterEvent;
        return copy;
      });
    return (
      classifyProdHopDetailed(makeHop({ hopTrace }), true, true).status ===
      "PROD_SINGLE_HOP_FAIL"
    );
  })(),
  ROLLBACK_FALSE_REQUIRED_FOR_PROD_CLEAN:
    classifyProdHopDetailed(makeHop(), false, true).status === "PROD_SINGLE_HOP_FAIL",
  ZERO_INPUT_SECONDARY_HOP_NOT_SECOND_INPUT:
    inputInfo.PROD_HOP_CLASSIFIER_SECONDARY_ARM_REJECTED_NO_INPUT_IGNORED === true &&
    inputInfo.totalRealInputCount === 1,
  TWO_REAL_INPUTS_FAIL:
    classifyProdHopDetailed(makeHop({ pointerdown: 2 }), true, true).status ===
    "PROD_MORE_THAN_ONE_INPUT",
  NO_FAKE_VISUAL_ZEROS: sampleWaapi.diagnostics.NO_FAKE_VISUAL_ZEROS === true,
  LOADING_ROUTE_MISMATCH_STILL_FAIL:
    classifyProdHopDetailed(makeHop({ loadingShellVisibleFrameCount: 1 }), true, true)
      .status === "PROD_SINGLE_HOP_FAIL" &&
    classifyProdHopDetailed(makeHop({ visibleRouteMismatchFrameCount: 1 }), true, true)
      .status === "PROD_SINGLE_HOP_FAIL",
};

const allInvariants = Object.values(invariants).every(Boolean);
const ok = pass === ITERATIONS && failures.length === 0 && allInvariants;

console.log(
  JSON.stringify(
    {
      harness: "PROD_HOP_WAAPI_CLASSIFIER_HARNESS",
      iterations: ITERATIONS,
      pass,
      fail: ITERATIONS - pass,
      ok,
      invariants,
      motorSample: detectProdHopMotor(makeHop()),
      failures: failures.slice(0, 10),
    },
    null,
    2,
  ),
);

if (!ok) process.exit(1);
console.log(`PROD_HOP_WAAPI_CLASSIFIER_HARNESS ${pass}/${ITERATIONS} PASS`);
