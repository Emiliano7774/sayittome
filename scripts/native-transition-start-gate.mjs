/**
 * Native-transition start gate — tooling/classifier only.
 * Separates logical settle (FULL_TX / bridge / pin) from physical native lifecycle.
 * Does not modify motor, watchdog timers, bridge, or history commit product paths.
 */

export const PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST =
  "NATIVE_TRANSITION_LIFECYCLE_NO_SCREENCAST";

export const FAILURE_FAMILY = {
  TRANSFORM_NOT_ANIMATED: "TRANSFORM_NOT_ANIMATED",
};

export const PRIMARY_STATUS = {
  NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE:
    "NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE",
  FINAL_WRITE_DID_NOT_CHANGE_TRANSFORM: "FINAL_WRITE_DID_NOT_CHANGE_TRANSFORM",
  TARGET_ALREADY_AT_FINAL_TRANSFORM: "TARGET_ALREADY_AT_FINAL_TRANSFORM",
  CSS_TRANSITION_NOT_APPLIED_AFTER_FINAL_WRITE: "CSS_TRANSITION_NOT_APPLIED_AFTER_FINAL_WRITE",
  TRANSITION_TARGET_NOT_RENDERABLE_AT_FINAL_WRITE:
    "TRANSITION_TARGET_NOT_RENDERABLE_AT_FINAL_WRITE",
  NATIVE_TRANSITION_PROVIDER_TARGET_MISMATCH: "NATIVE_TRANSITION_PROVIDER_TARGET_MISMATCH",
  NATIVE_TRANSITION_STARTED_BUT_DID_NOT_END: "NATIVE_TRANSITION_STARTED_BUT_DID_NOT_END",
  NATIVE_TRANSITION_LIFECYCLE_INCOMPLETE: "NATIVE_TRANSITION_LIFECYCLE_INCOMPLETE",
  NATIVE_TRANSITION_END_WITHOUT_RUN_OR_START: "NATIVE_TRANSITION_END_WITHOUT_RUN_OR_START",
};

export const INVARIANTS = {
  FULL_TX_RESOLVED_DOES_NOT_IMPLY_PHYSICAL_CLEAN: true,
  BRIDGE_COMPLETE_DOES_NOT_IMPLY_PHYSICAL_CLEAN: true,
  PIN_CLEAR_DOES_NOT_IMPLY_PHYSICAL_CLEAN: true,
  NO_NATIVE_START_NEVER_CLEAN: true,
  VALID_FINAL_WRITE_WITH_NO_NATIVE_START_CLASSIFIED_PRECISELY: true,
  START_YES_END_NO_CLASSIFIED_SEPARATELY: true,
  NO_RAF_SAMPLE_REQUIRED_FOR_NATIVE_PROVIDER: true,
  HISTORY_COMMIT_STILL_REQUIRES_NATIVE_TRANSITION: true,
};

function hasKind(trace, kind) {
  return (trace || []).some((e) => e?.kind === kind);
}

function findKind(trace, kind) {
  return (trace || []).find((e) => e?.kind === kind) ?? null;
}

function normalizeTransform(value) {
  if (value == null) return null;
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function transformsEquivalent(a, b) {
  const na = normalizeTransform(a);
  const nb = normalizeTransform(b);
  if (na == null || nb == null) return false;
  const compact = (s) =>
    s
      .replace(/translate3d\(([^)]+)\)/g, (_, inner) => {
        const parts = inner.split(",").map((p) => p.trim());
        return `translate3d(${parts
          .map((p) => (p === "0" || p === "0px" ? "0px" : p))
          .join(", ")})`;
      })
      .replace(/,\s*0\s*,/g, ", 0px,")
      .replace(/,\s*0\)$/g, ", 0px)");
  return compact(na) === compact(nb) || na === nb;
}

function cssTransitionIncludesTransform(css) {
  if (css == null) return null;
  const s = String(css).toLowerCase();
  if (!s || s === "none" || s === "all 0s ease 0s") return false;
  if (!s.includes("transform")) return false;
  const zeroDuration = /(?:^|,)\s*transform\s+0(?:\.0+)?m?s\b/.test(s) || /\b0s\b/.test(s);
  if (zeroDuration && !/\b110ms\b|\b0\.11s\b/.test(s)) return false;
  return true;
}

/**
 * Precommit arming evidence from hopTrace (tooling only).
 */
export function extractPrecommitArmingEvidence(hopTrace = []) {
  const precommitWritten = hasKind(hopTrace, "MICRO_SLIDE_TRANSITION_PRECOMMIT_WRITTEN");
  const barrierArmed = hasKind(hopTrace, "MICRO_SLIDE_TRANSITION_PRECOMMIT_FRAME_BARRIER_ARMED");
  const barrierPassed = hasKind(
    hopTrace,
    "MICRO_SLIDE_TRANSITION_PRECOMMIT_FRAME_BARRIER_PASSED",
  );
  const finalAfterPrecommit = hasKind(
    hopTrace,
    "MICRO_SLIDE_TRANSITION_FINAL_WRITE_AFTER_PRECOMMIT",
  );
  const noLayout = hasKind(
    hopTrace,
    "MICRO_SLIDE_TRANSITION_ARMING_NO_LAYOUT_READS_CONFIRMED",
  );
  const latencyEv = findKind(hopTrace, "MICRO_SLIDE_TRANSITION_ARMING_LATENCY_MS");
  const frameEv = findKind(hopTrace, "MICRO_SLIDE_TRANSITION_ARMING_FRAME_COUNT");
  const finalEv = findKind(hopTrace, "MICRO_SLIDE_TRANSITION_FINAL_WRITE_AFTER_PRECOMMIT");
  const precommitEv = findKind(hopTrace, "MICRO_SLIDE_TRANSITION_PRECOMMIT_WRITTEN");
  const armingLatencyMs =
    latencyEv?.armingLatencyMs ?? finalEv?.armingLatencyMs ?? null;
  const armingFrameCount =
    frameEv?.armingFrameCount ?? finalEv?.armingFrameCount ?? (finalAfterPrecommit ? 2 : null);
  const precommitMono = precommitEv?.monoMs ?? null;
  const startEv =
    findKind(hopTrace, "SLIDE_NATIVE_TRANSITION_START_OBSERVED") ||
    findKind(hopTrace, "SLIDE_TRANSITION_START_ANCHOR_COMMITTED");
  const transitionStartAfterPrecommitMs =
    precommitMono != null && startEv?.monoMs != null ? startEv.monoMs - precommitMono : null;

  return {
    transitionPrecommitWritten: precommitWritten,
    transitionPrecommitBarrierPassed: barrierPassed || (barrierArmed && finalAfterPrecommit),
    transitionFinalWriteAfterPrecommit: finalAfterPrecommit,
    transitionArmingLatencyMs: armingLatencyMs,
    transitionArmingFrameCount: armingFrameCount,
    transitionArmingNoLayoutReads: noLayout || precommitWritten || finalAfterPrecommit,
    transitionStartAfterPrecommitMs,
    precommitBarrierDidNotProduceNativeStart: false,
  };
}

/**
 * Non-perturbing final-write snapshot from existing hopTrace fields only.
 * Never calls getComputedStyle / getBoundingClientRect.
 */
export function extractFinalWriteStyleSnapshot(hopTrace = []) {
  const attempt = findKind(hopTrace, "SLIDE_FINAL_TRANSFORMS_WRITE_ATTEMPT");
  const returned = findKind(hopTrace, "SLIDE_FINAL_TRANSFORMS_WRITE_RETURNED");
  const functional = findKind(hopTrace, "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL");
  const listener = findKind(hopTrace, "TRANSITION_LISTENER_ATTACHED");
  const available = Boolean(attempt || returned);

  if (!available) {
    return {
      FINAL_WRITE_STYLE_SNAPSHOT_AVAILABLE: false,
      FINAL_WRITE_STYLE_SNAPSHOT_NON_PERTURBING: true,
      FINAL_WRITE_STYLE_SNAPSHOT_SKIPPED: true,
      skipReason: "no-final-write-trace-fields",
      getComputedStyleDuringCriticalWindow: false,
      layoutReadsDuringCriticalWindow: false,
    };
  }

  const sourceBefore =
    attempt?.sourceBeforeInlineTransform ?? returned?.sourceBeforeInlineTransform ?? null;
  const sourceAfter =
    returned?.sourceAfterInlineTransform ?? attempt?.sourceTargetTransform ?? null;
  const destBefore =
    attempt?.destinationBeforeInlineTransform ?? returned?.destinationBeforeInlineTransform ?? null;
  const destAfter =
    returned?.destinationAfterInlineTransform ?? attempt?.destinationTargetTransform ?? null;
  const css =
    returned?.sourceAfterInlineTransition ??
    attempt?.sourceInlineTransition ??
    returned?.destinationAfterInlineTransition ??
    null;

  return {
    FINAL_WRITE_STYLE_SNAPSHOT_AVAILABLE: true,
    FINAL_WRITE_STYLE_SNAPSHOT_NON_PERTURBING: true,
    FINAL_WRITE_STYLE_SNAPSHOT_SKIPPED: false,
    getComputedStyleDuringCriticalWindow: false,
    layoutReadsDuringCriticalWindow: false,
    intendedTransformBefore: sourceBefore,
    intendedTransformAfter: sourceAfter,
    destinationTransformBefore: destBefore,
    destinationTransformAfter: destAfter,
    expectedTransitionDurationMs: 110,
    expectedTargetRole: "source+destination hosts",
    sourceNodeId: attempt?.sourceNodeId ?? returned?.sourceNodeId ?? null,
    destinationNodeId: attempt?.destinationNodeId ?? returned?.destinationNodeId ?? null,
    listenerHostId: listener?.hostInstanceId ?? listener?.hostId ?? null,
    sourceIsConnected: returned?.sourceIsConnected ?? null,
    destinationIsConnected: returned?.destinationIsConnected ?? null,
    datasetSlideState: returned?.datasetSlideState ?? attempt?.datasetSlideState ?? null,
    cssTransitionAfterWrite: css,
    finalInlineCommitted: Boolean(functional),
    commitMode: attempt?.commitMode ?? returned?.commitMode ?? null,
  };
}

export function extractFinalWriteEvidence(hopTrace = [], overrides = {}) {
  const snap = extractFinalWriteStyleSnapshot(hopTrace);
  const attempt = findKind(hopTrace, "SLIDE_FINAL_TRANSFORMS_WRITE_ATTEMPT");
  const returned = findKind(hopTrace, "SLIDE_FINAL_TRANSFORMS_WRITE_RETURNED");
  const functional = hasKind(hopTrace, "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL");
  const listener = findKind(hopTrace, "TRANSITION_LISTENER_ATTACHED");

  const sourceBefore = overrides.sourceBefore ?? snap.intendedTransformBefore;
  const sourceAfter = overrides.sourceAfter ?? snap.intendedTransformAfter;
  const destBefore = overrides.destBefore ?? snap.destinationTransformBefore;
  const destAfter = overrides.destAfter ?? snap.destinationTransformAfter;
  const css = overrides.cssTransition ?? snap.cssTransitionAfterWrite;

  const sourceDeltaNonzero =
    sourceBefore != null &&
    sourceAfter != null &&
    !transformsEquivalent(sourceBefore, sourceAfter);
  const destDeltaNonzero =
    destBefore != null && destAfter != null && !transformsEquivalent(destBefore, destAfter);
  const transformDeltaNonzero =
    overrides.transformDeltaNonzero ?? (sourceDeltaNonzero || destDeltaNonzero);

  const targetAlreadyFinal =
    overrides.targetAlreadyAtFinal ??
    (sourceBefore != null &&
      sourceAfter != null &&
      transformsEquivalent(sourceBefore, sourceAfter) &&
      destBefore != null &&
      destAfter != null &&
      transformsEquivalent(destBefore, destAfter));

  const cssApplied =
    overrides.cssTransitionApplied ??
    (cssTransitionIncludesTransform(css) === true ||
      (css == null && functional && transformDeltaNonzero === true
        ? null
        : cssTransitionIncludesTransform(css)));

  const sourceConnected = overrides.sourceConnected ?? snap.sourceIsConnected;
  const destConnected = overrides.destinationConnected ?? snap.destinationIsConnected;
  const targetRenderable =
    overrides.targetRenderable ??
    (sourceConnected === false || destConnected === false
      ? false
      : sourceConnected === true || destConnected === true
        ? true
        : null);

  const listenerHost = snap.listenerHostId;
  const destId = snap.destinationNodeId ?? attempt?.destinationNodeId ?? null;
  const listenerMatched =
    overrides.listenerTargetMatched ??
    (listenerHost == null || destId == null
      ? null
      : String(listenerHost) === String(destId) ||
        String(listenerHost) === String(attempt?.hostInstanceId ?? ""));

  const finalWriteValid =
    overrides.finalWriteValid ??
    (functional &&
      transformDeltaNonzero === true &&
      cssApplied !== false &&
      targetAlreadyFinal !== true &&
      targetRenderable !== false &&
      listenerMatched !== false);

  return {
    finalInlineTargetCommitted: functional,
    finalWriteValid: Boolean(finalWriteValid),
    transformDeltaNonzero: Boolean(transformDeltaNonzero),
    targetAlreadyAtFinalTransform: Boolean(targetAlreadyFinal),
    cssTransitionApplied: cssApplied,
    targetRenderable,
    listenerTargetMatched: listenerMatched,
    listenerAttached: Boolean(listener),
    styleSnapshot: snap,
    sourceBefore,
    sourceAfter,
    destBefore,
    destAfter,
    css,
  };
}

export function countNativeLifecycleEvidence({
  transitionEvents = [],
  hopTrace = [],
  nativeLifecycleSummary = null,
} = {}) {
  const transform = (transitionEvents || []).filter((e) => e.propertyName === "transform");
  const runs = transform.filter((e) => e.type === "transitionrun");
  const starts = transform.filter((e) => e.type === "transitionstart");
  const ends = transform.filter((e) => e.type === "transitionend");
  const cancels = transform.filter((e) => e.type === "transitioncancel");

  const appRuns = (hopTrace || []).filter((e) => e.kind === "SLIDE_NATIVE_TRANSITION_RUN_OBSERVED");
  const appStarts = (hopTrace || []).filter(
    (e) => e.kind === "SLIDE_NATIVE_TRANSITION_START_OBSERVED",
  );
  const appEnds = (hopTrace || []).filter((e) => e.kind === "SLIDE_NATIVE_TRANSITION_END_OBSERVED");
  const appCancels = (hopTrace || []).filter(
    (e) => e.kind === "SLIDE_NATIVE_TRANSITION_CANCEL_OBSERVED",
  );

  const summary = nativeLifecycleSummary || {};
  const runCount = Math.max(
    runs.length,
    appRuns.length,
    Number(summary.transitionrunCount ?? 0) || 0,
  );
  const startCount = Math.max(
    starts.length,
    appStarts.length,
    Number(summary.transitionstartCount ?? 0) || 0,
  );
  const endCount = Math.max(
    ends.length,
    appEnds.length,
    Number(summary.transitionendCount ?? 0) || 0,
  );
  const cancelCount = Math.max(
    cancels.length,
    appCancels.length,
    Number(summary.transitioncancelCount ?? 0) || 0,
  );

  const endEvent = ends[0] ?? null;
  const elapsedTime =
    endEvent?.elapsedTime ?? summary.transitionendElapsedTime ?? appEnds[0]?.elapsedTime ?? null;
  const elapsedCoherent =
    typeof elapsedTime === "number" && elapsedTime >= 0.08 && elapsedTime <= 0.2;

  const settleEv =
    findKind(hopTrace, "SETTLE_INITIATED") || findKind(hopTrace, "SETTLED") || null;
  const settleReason =
    settleEv?.settleReason ??
    settleEv?.reason ??
    settleEv?.note ??
    summary.settleReason ??
    null;

  const traceRun = (hopTrace || []).filter(
    (e) =>
      e.kind === "TRANSITION_RUN" ||
      e.kind === "SLIDE_NATIVE_TRANSITION_RUN_OBSERVED" ||
      (e.kind === "TRANSITION_START" && false),
  ).length;
  const traceStart = (hopTrace || []).filter(
    (e) =>
      e.kind === "SLIDE_TRANSITION_START_ANCHOR_COMMITTED" ||
      e.kind === "SLIDE_NATIVE_TRANSITION_START_OBSERVED",
  ).length;
  const traceEnd = (hopTrace || []).filter(
    (e) =>
      e.kind === "TRANSITION_END" ||
      e.kind === "TRANSITION_END_RECEIVED" ||
      e.kind === "SLIDE_NATIVE_TRANSITION_END_OBSERVED",
  ).length;

  return {
    nativeTransitionRunCount: runCount,
    nativeTransitionStartCount: startCount,
    nativeTransitionEndCount: endCount,
    nativeTransitionCancelCount: cancelCount,
    traceTransitionRunCount: Math.max(traceRun, appRuns.length),
    traceTransitionStartCount: Math.max(traceStart, appStarts.length),
    traceTransitionEndCount: Math.max(traceEnd, appEnds.length),
    transitionendElapsedTime: elapsedTime,
    elapsedCoherent: endCount > 0 ? elapsedCoherent : false,
    settleReason,
    neverStartedAfterFinalWrite:
      String(settleReason || "") === "transition-never-started-after-final-write",
  };
}

/**
 * Precise primary class under TRANSFORM_NOT_ANIMATED family.
 */
export function classifyNativeTransitionPhysicalFailure({
  provider = PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST,
  finalWrite = {},
  lifecycle = {},
  physicalSatisfied = false,
} = {}) {
  if (provider !== PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST) {
    return {
      primaryFailureClass: null,
      failureFamily: null,
      specificTransitionFailure: null,
      betterClassification: null,
    };
  }

  if (physicalSatisfied) {
    return {
      primaryFailureClass: null,
      failureFamily: null,
      specificTransitionFailure: null,
      betterClassification: null,
    };
  }

  const run = lifecycle.nativeTransitionRunCount ?? 0;
  const start = lifecycle.nativeTransitionStartCount ?? 0;
  const end = lifecycle.nativeTransitionEndCount ?? 0;
  const cancel = lifecycle.nativeTransitionCancelCount ?? 0;

  let primary = PRIMARY_STATUS.NATIVE_TRANSITION_LIFECYCLE_INCOMPLETE;
  let specific = "native-lifecycle-incomplete";

  if (finalWrite.listenerTargetMatched === false) {
    primary = PRIMARY_STATUS.NATIVE_TRANSITION_PROVIDER_TARGET_MISMATCH;
    specific = "listener-target-mismatch";
  } else if (finalWrite.targetRenderable === false) {
    primary = PRIMARY_STATUS.TRANSITION_TARGET_NOT_RENDERABLE_AT_FINAL_WRITE;
    specific = "target-not-renderable";
  } else if (finalWrite.cssTransitionApplied === false) {
    primary = PRIMARY_STATUS.CSS_TRANSITION_NOT_APPLIED_AFTER_FINAL_WRITE;
    specific = "css-transition-not-applied";
  } else if (finalWrite.targetAlreadyAtFinalTransform === true) {
    primary = PRIMARY_STATUS.TARGET_ALREADY_AT_FINAL_TRANSFORM;
    specific = "target-already-at-final";
  } else if (
    finalWrite.finalInlineTargetCommitted &&
    finalWrite.transformDeltaNonzero === false
  ) {
    primary = PRIMARY_STATUS.FINAL_WRITE_DID_NOT_CHANGE_TRANSFORM;
    specific = "final-write-delta-zero";
  } else if (end > 0 && run === 0 && start === 0) {
    primary = PRIMARY_STATUS.NATIVE_TRANSITION_END_WITHOUT_RUN_OR_START;
    specific = "transitionend-without-run-or-start";
  } else if ((run > 0 || start > 0) && end === 0) {
    primary = PRIMARY_STATUS.NATIVE_TRANSITION_STARTED_BUT_DID_NOT_END;
    specific =
      cancel > 0
        ? "native-start-without-end-cancel"
        : String(lifecycle.settleReason || "").includes("watchdog")
          ? "native-start-without-end-watchdog"
          : "native-start-without-end";
  } else if (
    finalWrite.finalWriteValid &&
    run === 0 &&
    start === 0 &&
    end === 0 &&
    cancel === 0
  ) {
    primary = PRIMARY_STATUS.NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE;
    specific = lifecycle.neverStartedAfterFinalWrite
      ? "transition-never-started-after-final-write"
      : "native-run-start-end-zero-after-valid-final-write";
  } else if (lifecycle.neverStartedAfterFinalWrite) {
    primary = PRIMARY_STATUS.NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE;
    specific = "transition-never-started-after-final-write";
  }

  return {
    primaryFailureClass: primary,
    failureFamily: FAILURE_FAMILY.TRANSFORM_NOT_ANIMATED,
    specificTransitionFailure: specific,
    betterClassification: primary,
  };
}

export function evaluatePhysicalNativeTransitionSatisfied({
  provider = PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST,
  engineSlideOccurred = false,
  domSlideOccurred = false,
  phaseArmed = false,
  phaseSliding = false,
  finalWrite = {},
  lifecycle = {},
  noRafSamplesRequired = true,
} = {}) {
  const required = provider === PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST;
  if (!required) {
    return {
      physicalNativeTransitionRequired: false,
      physicalNativeTransitionSatisfied: null,
      NO_RAF_SAMPLE_REQUIRED_FOR_NATIVE_PROVIDER: noRafSamplesRequired,
    };
  }

  const settleOk =
    lifecycle.settleReason === "transitionend" ||
    lifecycle.settleReason === "end:transitionend";
  const satisfied =
    engineSlideOccurred === true &&
    domSlideOccurred === true &&
    (phaseArmed === true || phaseArmed == null) &&
    (phaseSliding === true || phaseSliding == null) &&
    finalWrite.finalInlineTargetCommitted === true &&
    (lifecycle.nativeTransitionRunCount ?? 0) > 0 &&
    (lifecycle.nativeTransitionStartCount ?? 0) > 0 &&
    (lifecycle.nativeTransitionEndCount ?? 0) > 0 &&
    (lifecycle.nativeTransitionCancelCount ?? 0) === 0 &&
    lifecycle.elapsedCoherent === true &&
    settleOk &&
    !lifecycle.neverStartedAfterFinalWrite;

  return {
    physicalNativeTransitionRequired: true,
    physicalNativeTransitionSatisfied: satisfied,
    NO_RAF_SAMPLE_REQUIRED_FOR_NATIVE_PROVIDER: true,
    FULL_TX_RESOLVED_DOES_NOT_IMPLY_PHYSICAL_CLEAN: true,
  };
}

/**
 * Authoritative native-start gate evaluation for release tooling.
 */
export function evaluateNativeTransitionStartGate(input = {}) {
  const {
    provider = PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST,
    hopTrace = [],
    transitionEvents = [],
    nativeLifecycleSummary = null,
    engineSlideOccurred = false,
    domSlideOccurred = false,
    currentHopEvaluationStatus = null,
    bridgeCompleted = false,
    pinCleared = false,
    commitMode = null,
    phaseArmed = null,
    phaseSliding = null,
    noScreencastPhysicalEvidenceValid = null,
    finalWriteOverrides = {},
    visualProvider = false,
    releaseBaseClean = null,
  } = input;

  if (visualProvider || provider !== PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST) {
    return {
      provider,
      visualProviderPreserved: true,
      physicalNativeTransitionRequired: false,
      physicalNativeTransitionSatisfied: null,
      logicalSettleWithoutNativeTransition: false,
      primaryFailureClass: null,
      failureFamily: null,
      specificTransitionFailure: null,
      releaseHopClean: releaseBaseClean,
      cleanRejectedBecause: [],
      invariants: INVARIANTS,
    };
  }

  const finalWrite = extractFinalWriteEvidence(hopTrace, finalWriteOverrides);
  const precommit = extractPrecommitArmingEvidence(hopTrace);
  const lifecycle = countNativeLifecycleEvidence({
    transitionEvents,
    hopTrace,
    nativeLifecycleSummary,
  });

  const phaseArmedResolved =
    phaseArmed ?? hasKind(hopTrace, "PHASE_ARMED");
  const phaseSlidingResolved =
    phaseSliding ?? hasKind(hopTrace, "PHASE_SLIDING");

  const physical = evaluatePhysicalNativeTransitionSatisfied({
    provider,
    engineSlideOccurred,
    domSlideOccurred,
    phaseArmed: phaseArmedResolved,
    phaseSliding: phaseSlidingResolved,
    finalWrite,
    lifecycle,
  });

  // Prefer explicit no-screencast validity when provided; never invent physical evidence.
  // When provider already validated run+start+end+settle, trust that (harness/live may omit
  // redundant transitionEvents in absoluteExtras). Never trust it when settle is
  // transition-never-started-after-final-write or when provider explicitly says false.
  const physicalSatisfied = lifecycle.neverStartedAfterFinalWrite
    ? false
    : noScreencastPhysicalEvidenceValid === false
      ? false
      : noScreencastPhysicalEvidenceValid === true
        ? true
        : physical.physicalNativeTransitionSatisfied;

  if (
    !physicalSatisfied &&
    precommit.transitionFinalWriteAfterPrecommit &&
    (lifecycle.nativeTransitionRunCount ?? 0) === 0 &&
    (lifecycle.nativeTransitionStartCount ?? 0) === 0
  ) {
    precommit.precommitBarrierDidNotProduceNativeStart = true;
  }

  const classification = classifyNativeTransitionPhysicalFailure({
    provider,
    finalWrite,
    lifecycle,
    physicalSatisfied,
  });

  if (precommit.precommitBarrierDidNotProduceNativeStart && classification.primaryFailureClass) {
    classification.secondaryFailure = "PRECOMMIT_BARRIER_DID_NOT_PRODUCE_NATIVE_START";
  }

  const fullTx =
    currentHopEvaluationStatus === "FULL_TX_RESOLVED" ||
    currentHopEvaluationStatus === "FULL_TX_RESOLVED_HISTORY_COMMIT" ||
    currentHopEvaluationStatus === "FULL_TX_RESOLVED_FROM_ARCHIVE";

  const logicalSettleWithoutNativeTransition =
    !physicalSatisfied &&
    (bridgeCompleted === true || pinCleared === true || fullTx === true);

  const bridgeCompletedWithoutNativeStart =
    bridgeCompleted === true && (lifecycle.nativeTransitionStartCount ?? 0) === 0;
  const pinClearedWithoutNativeStart =
    pinCleared === true && (lifecycle.nativeTransitionStartCount ?? 0) === 0;

  const cleanRejectedBecause = [];
  if (!physicalSatisfied) {
    if ((lifecycle.nativeTransitionRunCount ?? 0) === 0) {
      cleanRejectedBecause.push("missing-native-transitionrun");
    }
    if ((lifecycle.nativeTransitionStartCount ?? 0) === 0) {
      cleanRejectedBecause.push("missing-native-transitionstart");
    }
    if ((lifecycle.nativeTransitionEndCount ?? 0) === 0) {
      cleanRejectedBecause.push("missing-native-transitionend");
    }
    if (lifecycle.neverStartedAfterFinalWrite) {
      cleanRejectedBecause.push("transition-never-started-after-final-write");
    }
    if (logicalSettleWithoutNativeTransition) {
      cleanRejectedBecause.push("logical-settle-without-native-transition");
    }
    if (fullTx) {
      cleanRejectedBecause.push("FULL_TX_RESOLVED-does-not-imply-physical-clean");
    }
    if (bridgeCompletedWithoutNativeStart) {
      cleanRejectedBecause.push("bridge-complete-without-native-start");
    }
    if (pinClearedWithoutNativeStart) {
      cleanRejectedBecause.push("pin-clear-without-native-start");
    }
  }
  if ((lifecycle.nativeTransitionCancelCount ?? 0) > 0) {
    cleanRejectedBecause.push("native-transitioncancel");
  }
  if (!engineSlideOccurred) cleanRejectedBecause.push("ENGINE_SLIDE_OCCURRED=false");
  if (!domSlideOccurred) cleanRejectedBecause.push("DOM_SLIDE_OCCURRED=false");
  if (!finalWrite.finalInlineTargetCommitted) {
    cleanRejectedBecause.push("finalInlineTargetCommitted=false");
  }

  // History commit mode still requires the same physical native gate.
  const historyMode = commitMode === "history";
  if (historyMode && !physicalSatisfied) {
    cleanRejectedBecause.push("history-commit-still-requires-native-transition");
  }

  const releaseHopClean = physicalSatisfied === true && cleanRejectedBecause.length === 0;

  return {
    provider,
    physicalNativeTransitionRequired: true,
    physicalNativeTransitionSatisfied: physicalSatisfied,
    logicalSettleWithoutNativeTransition,
    bridgeCompletedWithoutNativeStart,
    pinClearedWithoutNativeStart,
    FULL_TX_RESOLVED_DOES_NOT_IMPLY_PHYSICAL_CLEAN: true,
    BRIDGE_COMPLETE_DOES_NOT_IMPLY_PHYSICAL_CLEAN: true,
    PIN_CLEAR_DOES_NOT_IMPLY_PHYSICAL_CLEAN: true,
    primaryFailureClass: classification.primaryFailureClass,
    failureFamily: classification.failureFamily,
    specificTransitionFailure: classification.specificTransitionFailure,
    betterClassification: classification.betterClassification,
    nativeTransitionRunCount: lifecycle.nativeTransitionRunCount,
    nativeTransitionStartCount: lifecycle.nativeTransitionStartCount,
    nativeTransitionEndCount: lifecycle.nativeTransitionEndCount,
    nativeTransitionCancelCount: lifecycle.nativeTransitionCancelCount,
    traceTransitionRunCount: lifecycle.traceTransitionRunCount,
    traceTransitionStartCount: lifecycle.traceTransitionStartCount,
    traceTransitionEndCount: lifecycle.traceTransitionEndCount,
    finalWriteValid: finalWrite.finalWriteValid,
    transformDeltaNonzero: finalWrite.transformDeltaNonzero,
    cssTransitionApplied: finalWrite.cssTransitionApplied,
    listenerTargetMatched: finalWrite.listenerTargetMatched,
    finalWriteEvidence: finalWrite,
    settleReason: lifecycle.settleReason,
    commitMode,
    historyCommitRequiresNativeTransition: true,
    transitionPrecommitWritten: precommit.transitionPrecommitWritten,
    transitionPrecommitBarrierPassed: precommit.transitionPrecommitBarrierPassed,
    transitionFinalWriteAfterPrecommit: precommit.transitionFinalWriteAfterPrecommit,
    transitionArmingLatencyMs: precommit.transitionArmingLatencyMs,
    transitionArmingFrameCount: precommit.transitionArmingFrameCount,
    transitionArmingNoLayoutReads: precommit.transitionArmingNoLayoutReads,
    transitionStartAfterPrecommitMs: precommit.transitionStartAfterPrecommitMs,
    precommitBarrierDidNotProduceNativeStart:
      precommit.precommitBarrierDidNotProduceNativeStart,
    secondaryFailure: classification.secondaryFailure ?? null,
    releaseHopClean,
    cleanRejectedBecause,
    releaseStopReason: releaseHopClean
      ? null
      : classification.primaryFailureClass || "PHYSICAL_NATIVE_TRANSITION_UNSATISFIED",
    invariants: INVARIANTS,
  };
}

/**
 * Attach gate fields onto an existing hop report (live or offline reprocess).
 */
export function enrichHopReportWithNativeStartGate(hopReport = {}, options = {}) {
  const hopTrace =
    options.hopTrace ||
    hopReport.hopNineEvidence?.hopTrace ||
    hopReport.hopTrace ||
    [];
  const provider =
    hopReport.PHYSICAL_EVIDENCE_PROVIDER_SELECTED ||
    hopReport.nativeLifecycleNoScreencastEvidence?.PHYSICAL_EVIDENCE_PROVIDER_SELECTED ||
    options.provider ||
    PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST;

  const softNavDiag = hopReport.softNavTraceObservability?.softNavDiag || [];
  const historyDiag = softNavDiag.find(
    (e) => e?.commitMode === "history" || e?.kind === "MICRO_SLIDE_HISTORY_PUSHSTATE_CALLED",
  );
  const gate = evaluateNativeTransitionStartGate({
    provider,
    hopTrace,
    transitionEvents: options.transitionEvents || hopReport.minimalExport?.transitionEvents || [],
    nativeLifecycleSummary:
      options.nativeLifecycleSummary || hopReport.nativeLifecycleSummary || null,
    engineSlideOccurred: hopReport.hopNineEvidence?.ENGINE_SLIDE_OCCURRED === true,
    domSlideOccurred: hopReport.hopNineEvidence?.DOM_SLIDE_OCCURRED === true,
    currentHopEvaluationStatus:
      hopReport.currentHopEvaluationStatus ||
      hopReport.softNavAwareCurrentHop?.evaluationStatus ||
      null,
    bridgeCompleted:
      hopReport.bridgeAudit?.bridgeCompleted === true ||
      hasKind(hopTrace, "POST_SETTLE_ROUTE_BRIDGE_COMPLETED"),
    pinCleared:
      hasKind(hopTrace, "MICRO_SLIDE_TX_PIN_CLEARED") ||
      hopReport.latchAudit?.latchReleaseReason === "final-route-ready",
    commitMode:
      options.commitMode ||
      hopReport.commitMode ||
      hopReport.navigationCommitMode ||
      historyDiag?.commitMode ||
      hopReport.softNavTraceObservability?.commitMode ||
      null,
    phaseArmed: hasKind(hopTrace, "PHASE_ARMED"),
    phaseSliding: hasKind(hopTrace, "PHASE_SLIDING"),
    noScreencastPhysicalEvidenceValid:
      hopReport.NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID ??
      hopReport.nativeLifecycleNoScreencastEvidence?.NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID ??
      null,
    finalWriteOverrides: options.finalWriteOverrides || {},
    visualProvider: options.visualProvider === true,
    releaseBaseClean: hopReport.RELEASE_HOP_CLEAN,
  });

  const oldClass =
    hopReport.hopNineEvidence?.classification ||
    hopReport.releaseChecks?.multisourceClassification ||
    hopReport.primaryFailureClass ||
    null;

  const releaseClean =
    provider === PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST
      ? Boolean(hopReport.RELEASE_HOP_CLEAN) && gate.physicalNativeTransitionSatisfied === true
      : hopReport.RELEASE_HOP_CLEAN;

  const out = {
    ...hopReport,
    RELEASE_HOP_CLEAN: releaseClean,
    COMPLETE_HOP_CAPTURE:
      provider === PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST
        ? releaseClean
        : hopReport.COMPLETE_HOP_CAPTURE,
    primaryFailureClass: releaseClean ? null : gate.primaryFailureClass,
    failureFamily: releaseClean ? null : gate.failureFamily,
    specificTransitionFailure: releaseClean ? null : gate.specificTransitionFailure,
    physicalNativeTransitionRequired: gate.physicalNativeTransitionRequired,
    physicalNativeTransitionSatisfied: gate.physicalNativeTransitionSatisfied,
    nativeTransitionRunCount: gate.nativeTransitionRunCount,
    nativeTransitionStartCount: gate.nativeTransitionStartCount,
    nativeTransitionEndCount: gate.nativeTransitionEndCount,
    nativeTransitionCancelCount: gate.nativeTransitionCancelCount,
    traceTransitionRunCount: gate.traceTransitionRunCount,
    traceTransitionStartCount: gate.traceTransitionStartCount,
    traceTransitionEndCount: gate.traceTransitionEndCount,
    finalWriteValid: gate.finalWriteValid,
    transformDeltaNonzero: gate.transformDeltaNonzero,
    cssTransitionApplied: gate.cssTransitionApplied,
    listenerTargetMatched: gate.listenerTargetMatched,
    logicalSettleWithoutNativeTransition: gate.logicalSettleWithoutNativeTransition,
    bridgeCompletedWithoutNativeStart: gate.bridgeCompletedWithoutNativeStart,
    pinClearedWithoutNativeStart: gate.pinClearedWithoutNativeStart,
    cleanRejectedBecause: gate.cleanRejectedBecause,
    betterClassification: gate.betterClassification,
    releaseStopReason: gate.releaseStopReason,
    FULL_TX_RESOLVED_DOES_NOT_IMPLY_PHYSICAL_CLEAN: true,
    BRIDGE_COMPLETE_DOES_NOT_IMPLY_PHYSICAL_CLEAN: true,
    PIN_CLEAR_DOES_NOT_IMPLY_PHYSICAL_CLEAN: true,
    FINAL_WRITE_STYLE_SNAPSHOT_AVAILABLE:
      gate.finalWriteEvidence?.styleSnapshot?.FINAL_WRITE_STYLE_SNAPSHOT_AVAILABLE ?? false,
    FINAL_WRITE_STYLE_SNAPSHOT_NON_PERTURBING:
      gate.finalWriteEvidence?.styleSnapshot?.FINAL_WRITE_STYLE_SNAPSHOT_NON_PERTURBING ?? true,
    finalWriteStyleSnapshot: gate.finalWriteEvidence?.styleSnapshot ?? null,
    transitionPrecommitWritten: gate.transitionPrecommitWritten,
    transitionPrecommitBarrierPassed: gate.transitionPrecommitBarrierPassed,
    transitionFinalWriteAfterPrecommit: gate.transitionFinalWriteAfterPrecommit,
    transitionArmingLatencyMs: gate.transitionArmingLatencyMs,
    transitionArmingFrameCount: gate.transitionArmingFrameCount,
    transitionArmingNoLayoutReads: gate.transitionArmingNoLayoutReads,
    transitionStartAfterPrecommitMs: gate.transitionStartAfterPrecommitMs,
    precommitBarrierDidNotProduceNativeStart: gate.precommitBarrierDidNotProduceNativeStart,
    secondaryFailure: gate.secondaryFailure,
    nativeTransitionStartGate: gate,
    oldMultisourceClassification: oldClass,
  };

  return out;
}

export function reprocessHopReportOffline(hopReport, options = {}) {
  const enriched = enrichHopReportWithNativeStartGate(hopReport, options);
  return {
    oldClass: enriched.oldMultisourceClassification,
    newPrimaryClass: enriched.primaryFailureClass,
    releaseHopClean: enriched.RELEASE_HOP_CLEAN,
    physicalNativeTransitionSatisfied: enriched.physicalNativeTransitionSatisfied,
    logicalSettleWithoutNativeTransition: enriched.logicalSettleWithoutNativeTransition,
    cleanRejectedBecause: enriched.cleanRejectedBecause,
    hopReport: enriched,
  };
}
