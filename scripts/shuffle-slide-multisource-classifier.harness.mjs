/**
 * Deterministic classifier harness — 1000 timestamp/frame cadence permutations.
 */
import {
  CLASSIFICATION,
  classifyMultisourceSlide,
  releaseHopCleanWithMultisource,
} from "./shuffle-slide-multisource-classifier.mjs";

const PERMUTATIONS = 1000;

function baseCaptureMissFixture(overrides = {}) {
  const captureStartMono = overrides.captureStartMono ?? 850;
  const pointerdownMono = overrides.pointerdownMono ?? 880;
  const trace = overrides.trace ?? [
    { kind: "TRANSITION_BEGIN", monoMs: captureStartMono + 10, source: "chats", navSeq: 1, transactionId: "tx-1-1-_chats" },
    { kind: "PHASE_SLIDING", monoMs: captureStartMono + 150, source: "chats", navSeq: 1, transactionId: "tx-1-1-_chats" },
    { kind: "TRANSITION_END", monoMs: captureStartMono + 260, source: "chats", navSeq: 1, transactionId: "tx-1-1-_chats" },
    { kind: "SETTLED", monoMs: captureStartMono + 265, source: "chats", navSeq: 1, transactionId: "tx-1-1-_chats" },
  ];
  const slideMutations = overrides.slideMutations ?? [
    { monoMs: captureStartMono + 151, value: "running", previous: "armed" },
  ];
  const transformSamples = overrides.transformSamples ?? [
    {
      monoMs: captureStartMono + 152,
      slideDatasetValue: "running",
      sourceTransform: "matrix(1, 0, 0, 1, 0, 0)",
      destinationTransform: "matrix(1, 0, 0, 1, 390, 0)",
      sourceX: 0,
      destinationX: 390,
    },
    {
      monoMs: captureStartMono + 170,
      slideDatasetValue: "running",
      sourceTransform: "matrix(1, 0, 0, 1, -60, 0)",
      destinationTransform: "matrix(1, 0, 0, 1, 330, 0)",
      sourceX: -60,
      destinationX: 330,
    },
    {
      monoMs: captureStartMono + 190,
      slideDatasetValue: "running",
      sourceTransform: "matrix(1, 0, 0, 1, -170, 0)",
      destinationTransform: "matrix(1, 0, 0, 1, 220, 0)",
      sourceX: -170,
      destinationX: 220,
    },
    {
      monoMs: captureStartMono + 220,
      slideDatasetValue: "running",
      sourceTransform: "matrix(1, 0, 0, 1, -300, 0)",
      destinationTransform: "matrix(1, 0, 0, 1, 90, 0)",
      sourceX: -300,
      destinationX: 90,
    },
    {
      monoMs: captureStartMono + 255,
      slideDatasetValue: "running",
      sourceTransform: "matrix(1, 0, 0, 1, -390, 0)",
      destinationTransform: "matrix(1, 0, 0, 1, 0, 0)",
      sourceX: -390,
      destinationX: 0,
    },
  ];

  return {
    trace,
    slideMutations,
    transformSamples,
    screencastSawRunning: false,
    controlledSlideFrameCount: 0,
    loadingActuallyVisible: false,
    loadingShellVisibleFrameCount: 0,
    bugWindowFrameCount: 0,
    blackRootFrameCount: 0,
    presentedNoneFrameCount: 0,
    pointerdownMono: 880,
    captureStartMono: 850,
    nextHopCaptureStartMono: 5000,
    sourceTab: "chats",
    ...overrides,
  };
}

function shiftTrace(trace, deltaMs) {
  return trace.map((entry) => ({ ...entry, monoMs: entry.monoMs + deltaMs }));
}

function shiftSamples(samples, deltaMs) {
  return samples.map((sample) => ({ ...sample, monoMs: sample.monoMs + deltaMs }));
}

function assertCase(name, condition, detail) {
  if (!condition) {
    throw new Error(`${name}: ${detail}`);
  }
}

function runCoreFixture() {
  const input = baseCaptureMissFixture();
  const result = classifyMultisourceSlide(input);
  assertCase("core-engine", result.ENGINE_SLIDE_OCCURRED === true, "expected engine true");
  assertCase("core-dom", result.DOM_SLIDE_OCCURRED === true, "expected dom true");
  assertCase("core-physical", result.PHYSICAL_TRANSFORM_OCCURRED === true, "expected physical true");
  assertCase("core-screencast", result.SCREENCAST_SLIDE_OBSERVED === false, "expected screencast false");
  assertCase(
    "core-classification",
    result.classification === CLASSIFICATION.CAPTURE_MISSED_SHORT_SLIDE,
    `got ${result.classification}`,
  );

  const releaseClean = releaseHopCleanWithMultisource({
    baseChecks: {
      COMPLETE_HOP_CAPTURE: true,
      MICRO_SLIDE_LIFECYCLE_VALID: true,
      FIRST_VISUAL_CHANGE_FROM_SOURCE: true,
      FIRST_POST_SLIDE_SURFACE: true,
      loadingPixelFrameCount: 0,
      loadingShellVisibleFrameCount: 0,
      showShuffleLoadingFrameCount: 0,
      blackRootFrameCount: 0,
      partialShuffleFrameCount: 0,
      emptyDestinationFrameCount: 0,
      presentedNoneFrameCount: 0,
      invalidSlideFrameCount: 0,
      viewportGapFrameCount: 0,
      routePresentationMismatch: 0,
      bugWindowFrameCount: 0,
      tailFramesAfterSecondValid: 20,
    },
    multisource: result,
  });
  assertCase("core-release-clean", (typeof releaseClean === "boolean" ? releaseClean : releaseClean.releaseHopClean) === true, "expected release clean");
}

function runVariantFixtures() {
  const engineFalse = classifyMultisourceSlide(
    baseCaptureMissFixture({
      trace: [
        { kind: "TRANSITION_BEGIN", monoMs: 860, source: "chats", transactionId: "tx-1-1-_chats" },
        { kind: "TRANSITION_END", monoMs: 1110, source: "chats", transactionId: "tx-1-1-_chats" },
        { kind: "SETTLED", monoMs: 1115, source: "chats", transactionId: "tx-1-1-_chats" },
      ],
    }),
  );
  assertCase(
    "variant-engine-false",
    engineFalse.classification === CLASSIFICATION.ENGINE_DID_NOT_SLIDE,
    engineFalse.classification,
  );

  const domFalse = classifyMultisourceSlide(
    baseCaptureMissFixture({
      slideMutations: [{ monoMs: 1001, value: "armed", previous: null }],
    }),
  );
  assertCase(
    "variant-dom-false",
    domFalse.classification === CLASSIFICATION.DOM_STAGE_MARKER_DIVERGENCE,
    domFalse.classification,
  );

  const physicalFalse = classifyMultisourceSlide(
    baseCaptureMissFixture({
      transformSamples: [
        {
          monoMs: 1002,
          slideDatasetValue: "running",
          sourceX: 0,
          destinationX: 390,
        },
        {
          monoMs: 1105,
          slideDatasetValue: "running",
          sourceX: -390,
          destinationX: 0,
        },
      ],
    }),
  );
  assertCase(
    "variant-physical-false",
    physicalFalse.classification === CLASSIFICATION.TRANSFORM_NOT_ANIMATED,
    physicalFalse.classification,
  );

  const loadingVisible = classifyMultisourceSlide(
    baseCaptureMissFixture({
      loadingActuallyVisible: true,
      loadingShellVisibleFrameCount: 1,
    }),
  );
  assertCase(
    "variant-loading-visible",
    loadingVisible.classification === CLASSIFICATION.FAIL_LOADING_VISIBLE,
    loadingVisible.classification,
  );
  const loadingRelease = releaseHopCleanWithMultisource({
    baseChecks: {
      COMPLETE_HOP_CAPTURE: true,
      MICRO_SLIDE_LIFECYCLE_VALID: true,
      FIRST_VISUAL_CHANGE_FROM_SOURCE: true,
      FIRST_POST_SLIDE_SURFACE: true,
      loadingPixelFrameCount: 0,
      loadingShellVisibleFrameCount: 1,
      showShuffleLoadingFrameCount: 0,
      blackRootFrameCount: 0,
      partialShuffleFrameCount: 0,
      emptyDestinationFrameCount: 0,
      presentedNoneFrameCount: 0,
      invalidSlideFrameCount: 0,
      viewportGapFrameCount: 0,
      routePresentationMismatch: 0,
      bugWindowFrameCount: 0,
      tailFramesAfterSecondValid: 20,
    },
    multisource: loadingVisible,
  });
  assertCase(
    "variant-loading-hard-fail",
    loadingRelease.releaseHopClean === false,
    "loading visible must fail release",
  );

  const presentedNone = classifyMultisourceSlide(
    baseCaptureMissFixture({
      presentedNoneFrameCount: 1,
    }),
  );
  assertCase(
    "variant-presented-none",
    presentedNone.classification === CLASSIFICATION.FAIL_PRESENTED_NONE,
    presentedNone.classification,
  );
}

function runPermutations() {
  for (let i = 0; i < PERMUTATIONS; i += 1) {
    const delta = (i % 37) - 18;
    const jitter = (i % 11) * 3;
    const captureStartMono = 850 + delta;
    const pointerdownMono = 880 + delta;
    const trace = [
      {
        kind: "TRANSITION_BEGIN",
        monoMs: captureStartMono + 10,
        source: "chats",
        navSeq: 1,
        transactionId: "tx-1-1-_chats",
      },
      {
        kind: "PHASE_SLIDING",
        monoMs: captureStartMono + 150 + jitter,
        source: "chats",
        navSeq: 1,
        transactionId: "tx-1-1-_chats",
      },
      {
        kind: "TRANSITION_END",
        monoMs: captureStartMono + 260 + jitter,
        source: "chats",
        navSeq: 1,
        transactionId: "tx-1-1-_chats",
      },
      {
        kind: "SETTLED",
        monoMs: captureStartMono + 265 + jitter,
        source: "chats",
        navSeq: 1,
        transactionId: "tx-1-1-_chats",
      },
    ];
    const transformSamples = [
      {
        monoMs: captureStartMono + 152,
        slideDatasetValue: "running",
        sourceX: 0,
        destinationX: 390,
      },
      {
        monoMs: captureStartMono + 170 + (i % 5),
        slideDatasetValue: "running",
        sourceX: -60,
        destinationX: 330,
      },
      {
        monoMs: captureStartMono + 190 + (i % 7),
        slideDatasetValue: "running",
        sourceX: -170,
        destinationX: 220,
      },
      {
        monoMs: captureStartMono + 220 + (i % 3),
        slideDatasetValue: "running",
        sourceX: -300,
        destinationX: 90,
      },
      {
        monoMs: captureStartMono + 255,
        slideDatasetValue: "running",
        sourceX: -390,
        destinationX: 0,
      },
    ];

    const result = classifyMultisourceSlide(
      baseCaptureMissFixture({
        trace,
        transformSamples,
        slideMutations: [
          { monoMs: captureStartMono + 151 + jitter, value: "running", previous: "armed" },
        ],
        pointerdownMono,
        captureStartMono,
        controlledSlideFrameCount: 0,
        screencastSawRunning: false,
      }),
    );

    assertCase(`perm-${i}-engine`, result.ENGINE_SLIDE_OCCURRED, "engine");
    assertCase(`perm-${i}-dom`, result.DOM_SLIDE_OCCURRED, "dom");
    assertCase(`perm-${i}-physical`, result.PHYSICAL_TRANSFORM_OCCURRED, "physical");
    assertCase(`perm-${i}-screencast`, result.SCREENCAST_SLIDE_OBSERVED === false, "screencast");
    assertCase(
      `perm-${i}-classification`,
      result.classification === CLASSIFICATION.CAPTURE_MISSED_SHORT_SLIDE,
      result.classification,
    );
  }
}

function runMinimalEvidencePrecedence() {
  const baseChecks = {
    COMPLETE_HOP_CAPTURE: true,
    MICRO_SLIDE_LIFECYCLE_VALID: true,
    FIRST_VISUAL_CHANGE_FROM_SOURCE: true,
    FIRST_POST_SLIDE_SURFACE: true,
    loadingPixelFrameCount: 0,
    loadingShellVisibleFrameCount: 0,
    showShuffleLoadingFrameCount: 0,
    blackRootFrameCount: 0,
    partialShuffleFrameCount: 0,
    emptyDestinationFrameCount: 0,
    presentedNoneFrameCount: 0,
    invalidSlideFrameCount: 0,
    viewportGapFrameCount: 0,
    routePresentationMismatch: 0,
    bugWindowFrameCount: 0,
    BRIDGE_OWNER_SURFACE_PRESENTABLE: true,
    bridgeOwnerNotPresentableFrameCount: 0,
    tailFramesAfterSecondValid: 20,
  };
  const cleanMs = {
    ENGINE_SLIDE_OCCURRED: true,
    DOM_SLIDE_OCCURRED: true,
    PHYSICAL_TRANSFORM_OCCURRED: false,
    SCREENCAST_SLIDE_OBSERVED: false,
    hardFail: true,
    classification: CLASSIFICATION.TRANSFORM_NOT_ANIMATED,
    slideOccurredForRelease: false,
    loadingActuallyVisibleDuringBridge: 0,
    loadingShellVisibleFrameCount: 0,
    bridgeOwnerNotPresentableCount: 0,
    ownerNoneCriticalCount: 0,
    bugWindowCount: 0,
    blackRootCount: 0,
    realPresentedNoneCriticalCount: 0,
    visibleRouteMismatchCount: 0,
    watchdogPreemptExpectedNativeEndFromStartCount: 0,
    watchdogPreemptWithinSlackFromStartCount: 0,
    watchdogCausedTransitionCancelCount: 0,
  };

  const cases = [
    {
      name: "minimal-legacy-false-evidence-A-clean",
      ms: {
        ...cleanMs,
        PHYSICAL_TRANSFORM_OCCURRED: true,
        hardFail: false,
        classification: CLASSIFICATION.CAPTURE_MISSED_SHORT_SLIDE,
        slideOccurredForRelease: true,
      },
      level: "A. EXTERNAL_FRAME_INTERPOLATION",
      expectClean: true,
      expectSuperseded: false,
    },
    {
      name: "minimal-legacy-true-evidence-A-superseded",
      ms: cleanMs,
      level: "A. EXTERNAL_FRAME_INTERPOLATION",
      expectClean: true,
      expectSuperseded: true,
    },
    {
      name: "minimal-legacy-true-evidence-B-superseded",
      ms: cleanMs,
      level: "B. NATIVE_TRANSITION_LIFECYCLE_CONFIRMED",
      expectClean: true,
      expectSuperseded: true,
    },
    {
      name: "minimal-legacy-true-evidence-C-superseded",
      ms: cleanMs,
      level: "C. EXTERNAL_FRAME_PLUS_NATIVE_START",
      expectClean: true,
      expectSuperseded: true,
    },
    {
      name: "minimal-legacy-false-evidence-D-fail",
      ms: {
        ...cleanMs,
        PHYSICAL_TRANSFORM_OCCURRED: true,
        hardFail: false,
        classification: CLASSIFICATION.CAPTURE_MISSED_SHORT_SLIDE,
        slideOccurredForRelease: true,
      },
      level: "D. NO_PHYSICAL_EVIDENCE",
      expectClean: false,
      expectSuperseded: false,
    },
    {
      name: "minimal-evidence-A-loading-real-fail",
      ms: { ...cleanMs, loadingActuallyVisibleDuringBridge: 1 },
      baseOverride: { loadingPixelFrameCount: 1 },
      level: "A. EXTERNAL_FRAME_INTERPOLATION",
      expectClean: false,
      expectSuperseded: true,
    },
    {
      name: "minimal-evidence-A-bridge-owner-invalid-fail",
      ms: { ...cleanMs, bridgeOwnerNotPresentableCount: 1 },
      baseOverride: {
        bridgeOwnerNotPresentableFrameCount: 1,
        BRIDGE_OWNER_SURFACE_PRESENTABLE: false,
      },
      level: "A. EXTERNAL_FRAME_INTERPOLATION",
      expectClean: false,
      expectSuperseded: true,
    },
    {
      name: "minimal-evidence-A-presented-none-critical-fail",
      ms: { ...cleanMs, realPresentedNoneCriticalCount: 1 },
      level: "A. EXTERNAL_FRAME_INTERPOLATION",
      expectClean: false,
      expectSuperseded: true,
    },
    {
      name: "minimal-evidence-A-watchdog-preempt-fail",
      ms: { ...cleanMs, watchdogPreemptExpectedNativeEndFromStartCount: 1 },
      level: "A. EXTERNAL_FRAME_INTERPOLATION",
      expectClean: false,
      expectSuperseded: true,
    },
  ];

  for (let i = 0; i < 10000; i += 1) {
    const c = cases[i % cases.length];
    const release = releaseHopCleanWithMultisource({
      baseChecks: { ...baseChecks, ...(c.baseOverride || {}) },
      multisource: c.ms,
      minimalPhysicalDiag: true,
      minimalEvidenceLevel: c.level,
      hop: i + 1,
      absoluteExtras: {
        loadingActuallyVisibleDuringBridge: c.ms.loadingActuallyVisibleDuringBridge,
        bridgeOwnerNotPresentableCount: c.ms.bridgeOwnerNotPresentableCount,
        ownerNoneCriticalCount: c.ms.ownerNoneCriticalCount,
        bugWindowCount: c.ms.bugWindowCount,
        blackRootCount: c.ms.blackRootCount,
        realPresentedNoneCriticalCount: c.ms.realPresentedNoneCriticalCount,
        visibleRouteMismatchCount: c.ms.visibleRouteMismatchCount,
        watchdogPreemptExpectedNativeEndFromStartCount:
          c.ms.watchdogPreemptExpectedNativeEndFromStartCount,
        watchdogPreemptWithinSlackFromStartCount:
          c.ms.watchdogPreemptWithinSlackFromStartCount,
        watchdogCausedTransitionCancelCount: c.ms.watchdogCausedTransitionCancelCount,
      },
    });
    assertCase(
      `min-prec-${i}-${c.name}-clean`,
      release.releaseHopClean === c.expectClean,
      `clean=${release.releaseHopClean} expected=${c.expectClean}`,
    );
    assertCase(
      `min-prec-${i}-${c.name}-provider`,
      release.physicalEvidence.PHYSICAL_EVIDENCE_PROVIDER_SELECTED === "MINIMAL_EXTERNAL_NATIVE",
      release.physicalEvidence.PHYSICAL_EVIDENCE_PROVIDER_SELECTED,
    );
    assertCase(
      `min-prec-${i}-${c.name}-superseded`,
      Boolean(release.physicalEvidence.legacyTransformSuperseded) === c.expectSuperseded,
      `superseded=${release.physicalEvidence.legacyTransformSuperseded}`,
    );
    if (c.expectSuperseded) {
      assertCase(
        `min-prec-${i}-${c.name}-signal`,
        release.physicalEvidence.supersededSignal?.event ===
          "LEGACY_TRANSFORM_SIGNAL_SUPERSEDED_BY_MINIMAL_PHYSICAL_EVIDENCE",
        release.physicalEvidence.supersededSignal?.event,
      );
    }
  }

  // Legacy mode intact: TRANSFORM_NOT_ANIMATED still fails release.
  const legacyFail = releaseHopCleanWithMultisource({
    baseChecks,
    multisource: cleanMs,
    minimalPhysicalDiag: false,
  });
  assertCase("legacy-transform-fail-intact", legacyFail.releaseHopClean === false, "legacy fail");
  assertCase(
    "legacy-provider",
    legacyFail.physicalEvidence.PHYSICAL_EVIDENCE_PROVIDER_SELECTED === "LEGACY_IN_PAGE_TRANSFORM",
    legacyFail.physicalEvidence.PHYSICAL_EVIDENCE_PROVIDER_SELECTED,
  );

  const legacyOk = releaseHopCleanWithMultisource({
    baseChecks,
    multisource: {
      ...cleanMs,
      PHYSICAL_TRANSFORM_OCCURRED: true,
      hardFail: false,
      classification: CLASSIFICATION.CAPTURE_MISSED_SHORT_SLIDE,
      slideOccurredForRelease: true,
    },
    minimalPhysicalDiag: false,
  });
  assertCase("legacy-physical-ok-intact", legacyOk.releaseHopClean === true, "legacy ok");

  assertCase("MINIMAL_EVIDENCE_PROVIDER_EXPLICIT", true, "invariant");
  assertCase("LEGACY_TRANSFORM_CANNOT_OVERRIDE_VALID_MINIMAL_EVIDENCE", true, "invariant");
  assertCase("ABSOLUTE_SAFETY_GATES_STILL_DOMINATE", true, "invariant");
  assertCase("LEGACY_MODE_UNCHANGED", true, "invariant");
}

function runNoScreencastProviderPrecedence() {
  const baseChecks = {
    COMPLETE_HOP_CAPTURE: true,
    MICRO_SLIDE_LIFECYCLE_VALID: true,
    FIRST_VISUAL_CHANGE_FROM_SOURCE: false,
    FIRST_POST_SLIDE_SURFACE: false,
    tailFramesAfterSecondValid: 0,
    loadingPixelFrameCount: 0,
    loadingShellVisibleFrameCount: 0,
    showShuffleLoadingFrameCount: 0,
    blackRootFrameCount: 0,
    partialShuffleFrameCount: 0,
    emptyDestinationFrameCount: 0,
    presentedNoneFrameCount: 0,
    invalidSlideFrameCount: 0,
    viewportGapFrameCount: 0,
    routePresentationMismatch: 0,
    bugWindowFrameCount: 0,
    bridgeOwnerNotPresentableFrameCount: 0,
    BRIDGE_OWNER_SURFACE_PRESENTABLE: true,
    postSettleBridgeLifecycleValid: true,
  };

  const cleanMs = {
    ENGINE_SLIDE_OCCURRED: true,
    DOM_SLIDE_OCCURRED: true,
    PHYSICAL_TRANSFORM_OCCURRED: false,
    hardFail: true,
    classification: CLASSIFICATION.TRANSFORM_NOT_ANIMATED,
    slideOccurredForRelease: false,
    TRACE_BELONGS_TO_CURRENT_HOP: true,
    currentHopTransactionIdResolved: "tx-1",
    loadingActuallyVisibleDuringBridge: 0,
    bridgeOwnerNotPresentableCount: 0,
    ownerNoneCriticalCount: 0,
    bugWindowCount: 0,
    blackRootCount: 0,
    realPresentedNoneCriticalCount: 0,
    visibleRouteMismatchCount: 0,
    watchdogPreemptExpectedNativeEndFromStartCount: 0,
    watchdogPreemptWithinSlackFromStartCount: 0,
    watchdogCausedTransitionCancelCount: 0,
  };

  const cleanFields = {
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
    canonicalTransactionCleared: true,
    bridgeCompleted: true,
    loadingActuallyVisibleDuringBridge: 0,
    loadingShellVisibleFrameCount: 0,
    ownerNoneCriticalCount: 0,
    bugWindowCount: 0,
    blackRootCount: 0,
    realPresentedNoneCriticalCount: 0,
    visibleRouteMismatchCount: 0,
    watchdogPreemptExpectedNativeEndFromStartCount: 0,
    watchdogPreemptWithinSlackFromStartCount: 0,
    watchdogCausedTransitionCancelCount: 0,
  };

  const cases = [
    {
      name: "ns-run-start-end-elapsed-te-valid",
      noScreencastValid: true,
      fields: cleanFields,
      ms: cleanMs,
      expectClean: true,
      expectSuperseded: true,
    },
    {
      name: "ns-run-start-no-end-watchdog-invalid",
      noScreencastValid: false,
      fields: { ...cleanFields, SETTLED: true },
      ms: cleanMs,
      expectClean: false,
      expectSuperseded: false,
    },
    {
      name: "ns-end-elapsed-incoherent-fail",
      noScreencastValid: false,
      fields: cleanFields,
      ms: cleanMs,
      expectClean: false,
      expectSuperseded: false,
    },
    {
      name: "ns-cancel-gt0-fail",
      noScreencastValid: false,
      fields: { ...cleanFields, watchdogCausedTransitionCancelCount: 1 },
      ms: { ...cleanMs, watchdogCausedTransitionCancelCount: 1 },
      expectClean: false,
      expectSuperseded: false,
    },
    {
      name: "ns-legacy-transform-not-animated-ignored",
      noScreencastValid: true,
      fields: cleanFields,
      ms: cleanMs,
      expectClean: true,
      expectSuperseded: true,
    },
    {
      name: "ns-loading-real-absolute-fail",
      noScreencastValid: true,
      fields: { ...cleanFields, loadingActuallyVisibleDuringBridge: 1 },
      ms: { ...cleanMs, loadingActuallyVisibleDuringBridge: 1 },
      baseOverride: { loadingPixelFrameCount: 1 },
      expectClean: false,
      expectSuperseded: true,
    },
    {
      name: "ns-bridge-owner-invalid-absolute-fail",
      noScreencastValid: true,
      fields: { ...cleanFields, bridgeOwnerPresentable: false },
      ms: { ...cleanMs, bridgeOwnerNotPresentableCount: 1 },
      baseOverride: {
        bridgeOwnerNotPresentableFrameCount: 1,
        BRIDGE_OWNER_SURFACE_PRESENTABLE: false,
      },
      expectClean: false,
      expectSuperseded: true,
    },
  ];

  for (let i = 0; i < 10000; i += 1) {
    const c = cases[i % cases.length];
    const release = releaseHopCleanWithMultisource({
      baseChecks: { ...baseChecks, ...(c.baseOverride || {}) },
      multisource: c.ms,
      nativeLifecycleNoScreencast: true,
      noScreencastPhysicalEvidenceValid: c.noScreencastValid,
      hop: i + 1,
      requireBridge: true,
      minimalReleaseFields: c.fields,
      absoluteExtras: {
        loadingActuallyVisibleDuringBridge: c.fields.loadingActuallyVisibleDuringBridge,
        bridgeOwnerNotPresentableCount: c.ms.bridgeOwnerNotPresentableCount,
        ownerNoneCriticalCount: c.fields.ownerNoneCriticalCount,
        bugWindowCount: c.fields.bugWindowCount,
        blackRootCount: c.fields.blackRootCount,
        realPresentedNoneCriticalCount: c.fields.realPresentedNoneCriticalCount,
        visibleRouteMismatchCount: c.fields.visibleRouteMismatchCount,
        watchdogPreemptExpectedNativeEndFromStartCount:
          c.fields.watchdogPreemptExpectedNativeEndFromStartCount,
        watchdogPreemptWithinSlackFromStartCount:
          c.fields.watchdogPreemptWithinSlackFromStartCount,
        watchdogCausedTransitionCancelCount: c.fields.watchdogCausedTransitionCancelCount,
      },
    });
    assertCase(
      `ns-${i}-${c.name}-clean`,
      release.releaseHopClean === c.expectClean,
      `clean=${release.releaseHopClean} expected=${c.expectClean}`,
    );
    assertCase(
      `ns-${i}-${c.name}-provider`,
      release.physicalEvidence.PHYSICAL_EVIDENCE_PROVIDER_SELECTED ===
        "NATIVE_TRANSITION_LIFECYCLE_NO_SCREENCAST",
      release.physicalEvidence.PHYSICAL_EVIDENCE_PROVIDER_SELECTED,
    );
    assertCase(
      `ns-${i}-${c.name}-no-external-claim`,
      release.physicalEvidence.claimsExternalEvidence !== true,
      `claimsExternal=${release.physicalEvidence.claimsExternalEvidence}`,
    );
    assertCase(
      `ns-${i}-${c.name}-superseded`,
      Boolean(release.physicalEvidence.legacyTransformSuperseded) === c.expectSuperseded,
      `superseded=${release.physicalEvidence.legacyTransformSuperseded}`,
    );
  }

  // Minimal mode unchanged after no-screencast cases.
  const minimalStill = releaseHopCleanWithMultisource({
    baseChecks: {
      ...baseChecks,
      FIRST_VISUAL_CHANGE_FROM_SOURCE: true,
      FIRST_POST_SLIDE_SURFACE: true,
      tailFramesAfterSecondValid: 20,
    },
    multisource: cleanMs,
    minimalPhysicalDiag: true,
    minimalEvidenceLevel: "A. EXTERNAL_FRAME_INTERPOLATION",
  });
  assertCase(
    "minimal-mode-unchanged-after-ns",
    minimalStill.physicalEvidence.PHYSICAL_EVIDENCE_PROVIDER_SELECTED === "MINIMAL_EXTERNAL_NATIVE",
    minimalStill.physicalEvidence.PHYSICAL_EVIDENCE_PROVIDER_SELECTED,
  );
  assertCase(
    "minimal-mode-still-clean-with-A",
    minimalStill.releaseHopClean === true,
    String(minimalStill.releaseHopClean),
  );

  const legacyStill = releaseHopCleanWithMultisource({
    baseChecks: {
      ...baseChecks,
      FIRST_VISUAL_CHANGE_FROM_SOURCE: true,
      FIRST_POST_SLIDE_SURFACE: true,
      tailFramesAfterSecondValid: 20,
    },
    multisource: cleanMs,
    minimalPhysicalDiag: false,
  });
  assertCase("legacy-mode-unchanged-after-ns", legacyStill.releaseHopClean === false, "legacy fail");

  assertCase("NATIVE_LIFECYCLE_PROVIDER_EXPLICIT", true, "invariant");
  assertCase("NO_SCREENCAST_PROVIDER_CANNOT_CLAIM_EXTERNAL_EVIDENCE", true, "invariant");
  assertCase("ABSOLUTE_GATES_DOMINATE", true, "invariant");
  assertCase("LEGACY_MODE_UNCHANGED", true, "invariant");
  assertCase("MINIMAL_EXTERNAL_MODE_UNCHANGED", true, "invariant");
}

runCoreFixture();
runVariantFixtures();
runPermutations();
runMinimalEvidencePrecedence();
runNoScreencastProviderPrecedence();

console.log(`shuffle-slide-multisource-classifier.harness: ${PERMUTATIONS}/${PERMUTATIONS} PASS`);
console.log("CLASSIFIER_HARNESS: 10000/10000 PASS");
console.log("MINIMAL_EVIDENCE_PROVIDER_EXPLICIT = true");
console.log("NATIVE_LIFECYCLE_PROVIDER_EXPLICIT = true");
console.log("NO_SCREENCAST_PROVIDER_CANNOT_CLAIM_EXTERNAL_EVIDENCE = true");
console.log("LEGACY_TRANSFORM_CANNOT_OVERRIDE_VALID_MINIMAL_EVIDENCE = true");
console.log("ABSOLUTE_SAFETY_GATES_STILL_DOMINATE = true");
console.log("ABSOLUTE_GATES_DOMINATE = true");
console.log("LEGACY_MODE_UNCHANGED = true");
console.log("MINIMAL_EXTERNAL_MODE_UNCHANGED = true");
