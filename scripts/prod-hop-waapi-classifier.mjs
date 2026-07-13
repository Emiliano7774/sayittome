/**
 * Prod hop classifier — CSS transition and WAAPI compositor modes.
 * Tooling only. Does not change product runtime / WAAPI motor / timings.
 */

export const PROD_HOP_CLASSIFIER_VERSION = "waapi-first-class-v1";

const WAAPI_SELECTED_KINDS = [
  "MICRO_SLIDE_WAAPI_MOTOR_SELECTED",
  "MICRO_SLIDE_WAAPI_SELECTED",
];
const WAAPI_CREATED_KINDS = [
  "MICRO_SLIDE_WAAPI_ANIMATION_CREATED",
  "MICRO_SLIDE_WAAPI_ANIMATIONS_CREATED",
];
const WAAPI_READY_KINDS = [
  "MICRO_SLIDE_WAAPI_ANIMATION_READY",
  "MICRO_SLIDE_WAAPI_READY",
];
const WAAPI_STARTED_KINDS = [
  "MICRO_SLIDE_WAAPI_ANIMATION_STARTED",
  "MICRO_SLIDE_WAAPI_STARTED",
  "MICRO_SLIDE_WAAPI_ANIMATIONS_STARTED",
];
const WAAPI_FINISHED_NATIVE_KINDS = [
  "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED",
  "MICRO_SLIDE_WAAPI_FINISHED",
];
const WAAPI_FINISHED_PROMOTED_KINDS = [
  "MICRO_SLIDE_WAAPI_FINISHED_PROMOTED_BY_WATCHDOG",
  "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_ACCEPTED",
];
const WAAPI_FINAL_STYLES_KINDS = ["MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED"];
const WAAPI_PHYSICAL_KINDS = [
  "MICRO_SLIDE_WAAPI_PHYSICAL_SATISFIED_CANONICAL",
  "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED",
];
const WAAPI_CANCEL_BEFORE_PHYSICAL_KINDS = [
  "MICRO_SLIDE_WAAPI_CANCEL_BEFORE_PHYSICAL",
  "MICRO_SLIDE_WAAPI_CANCELLED_BEFORE_PHYSICAL",
];
const WAAPI_REJECT_KINDS = [
  "MICRO_SLIDE_WAAPI_REJECTED",
  "MICRO_SLIDE_WAAPI_REJECT",
];
const WAAPI_UNAVAILABLE_KINDS = ["MICRO_SLIDE_WAAPI_UNAVAILABLE"];
const WAAPI_LOGICAL_WITHOUT_PHYSICAL_KINDS = [
  "MICRO_SLIDE_WAAPI_LOGICAL_SETTLE_WITHOUT_PHYSICAL",
];

function collectDiagEvents(hopReport) {
  const ev = hopReport?.hopNineEvidence ?? {};
  const softDiag = hopReport?.hopNineDiag?.softNavDiag ?? hopReport?.softNavDiag ?? [];
  const obs =
    hopReport?.softNavTraceObservability ??
    hopReport?.hopNineEvidence?.softNavTraceObservability ??
    {};
  const pinHistory =
    obs?.pinDiag?.pinHistory ?? (Array.isArray(obs?.pinDiag) ? obs.pinDiag : []) ?? [];
  const archiveEvents = obs?.traceArchive?.events ?? [];
  const trace = ev.hopTrace ?? hopReport?.mainTabToShuffleTrace ?? [];
  return [...trace, ...pinHistory, ...archiveEvents, ...softDiag];
}

function countKinds(events, kinds) {
  const set = new Set(kinds);
  return events.filter((e) => set.has(e?.kind)).length;
}

function hasAnyKind(events, kinds) {
  return countKinds(events, kinds) > 0;
}

function softKindCount(soft, softDiag, k) {
  if (typeof soft[`${k}_count`] === "number") return soft[`${k}_count`];
  if (typeof soft[k] === "number") return soft[k];
  return softDiag.filter((e) => e.kind === k).length;
}

/**
 * Count real prod inputs. Arm-rejected secondary hops with 0 inputs do not count.
 */
export function countRealProdHopInputs({
  primaryHopReport,
  secondaryHopReports = [],
  reportLogicalInputCount = null,
  reportPointerdownCount = null,
} = {}) {
  const primary =
    primaryHopReport?.runnerIsolation?.hopPointerdownCount ??
    primaryHopReport?.logicalInputCount ??
    reportLogicalInputCount ??
    reportPointerdownCount ??
    0;

  let secondaryReal = 0;
  let secondaryArmRejectedZeroInput = 0;
  for (const hop of secondaryHopReports) {
    const inputs =
      hop?.runnerIsolation?.hopPointerdownCount ??
      hop?.logicalInputCount ??
      hop?.navInputEvents?.length ??
      0;
    const armRejected =
      hop?.PROD_TRUE_INPUT_ARM_REJECTED === true ||
      hop?.PROD_TRUE_INPUT_ARMED === false;
    if (armRejected && inputs === 0) {
      secondaryArmRejectedZeroInput += 1;
      continue;
    }
    secondaryReal += Number(inputs) || 0;
  }

  const total = Number(primary) + secondaryReal;
  return {
    primaryInputCount: Number(primary) || 0,
    secondaryRealInputCount: secondaryReal,
    secondaryArmRejectedZeroInputCount: secondaryArmRejectedZeroInput,
    totalRealInputCount: total,
    PROD_HOP_CLASSIFIER_SECONDARY_ARM_REJECTED_NO_INPUT_IGNORED:
      secondaryArmRejectedZeroInput > 0 && secondaryReal === 0,
    EXACTLY_ONE_REAL_INPUT: total === 1,
    TWO_OR_MORE_REAL_INPUTS: total >= 2,
    NO_REAL_INPUT: total === 0,
  };
}

export function detectProdHopMotor(hopReport, events = null) {
  const all = events ?? collectDiagEvents(hopReport);
  const summary = hopReport?.nativeLifecycleSummary ?? {};
  const native = hopReport?.nativeLifecycleNoScreencastEvidence ?? {};
  const settle =
    summary.settleReason ?? native.settleReason ?? hopReport?.settleReason ?? null;
  const waapiSelected = hasAnyKind(all, WAAPI_SELECTED_KINDS);
  const settleLooksWaapi =
    typeof settle === "string" && settle.toLowerCase().includes("waapi");
  const cssTransitionEvidence =
    (native.transitionrunCount ?? 0) > 0 ||
    (native.transitionstartCount ?? 0) > 0 ||
    (native.transitionendCount ?? 0) > 0;

  let motor = "unknown";
  if (waapiSelected || settleLooksWaapi) motor = "waapi";
  else if (cssTransitionEvidence) motor = "css";

  return {
    PROD_HOP_CLASSIFIER_MOTOR_DETECTED: motor,
    PROD_HOP_CLASSIFIER_WAAPI_MODE: motor === "waapi",
    PROD_HOP_CLASSIFIER_CSS_MODE: motor === "css",
    settleReason: settle,
    waapiSelected,
    cssTransitionEvidence,
  };
}

function evaluateNoScreencastVisual(hopReport) {
  const provider =
    hopReport?.PHYSICAL_EVIDENCE_PROVIDER_SELECTED ??
    hopReport?.CAPTURE_PROVIDER_SELECTED ??
    hopReport?.physicalEvidenceProvider ??
    null;
  const noScreencast =
    provider === "WAAPI_COMPOSITOR_LIFECYCLE_NO_SCREENCAST" ||
    provider === "NONE_DURING_CRITICAL_WINDOW" ||
    hopReport?.blackRootEvaluationStatus?.includes?.("NOT_EVALUATED") ||
    hopReport?.blackRootCritical === "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER";

  if (!noScreencast) {
    return {
      noScreencastProvider: false,
      BLACK_ROOT_CRITICAL: hopReport?.blackRootCritical ?? hopReport?.blackRootEvaluationStatus ?? null,
      PRESENTED_NONE_CRITICAL:
        hopReport?.presentedNoneCritical ?? hopReport?.presentedNoneEvaluationStatus ?? null,
      NO_FAKE_VISUAL_ZEROS: true,
      NO_LOADING_MID_SLIDE_VISUAL_GATE: hopReport?.NO_LOADING_MID_SLIDE_VISUAL_GATE ?? null,
      PERMANENT_ROLLOUT_REQUIRES_PIXEL_VISUAL_FOR_NO_LOADING: true,
    };
  }

  const black =
    hopReport?.blackRootCritical ??
    hopReport?.blackRootEvaluationStatus ??
    "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER";
  const presented =
    hopReport?.presentedNoneCritical ??
    hopReport?.presentedNoneEvaluationStatus ??
    "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER";

  const fakeZero =
    black === 0 ||
    black === "0" ||
    presented === 0 ||
    presented === "0" ||
    black === false ||
    presented === false;

  return {
    noScreencastProvider: true,
    BLACK_ROOT_CRITICAL: black,
    PRESENTED_NONE_CRITICAL: presented,
    NO_FAKE_VISUAL_ZEROS: !fakeZero,
    PROD_HOP_CLASSIFIER_NO_SCREENCAST_NOT_EVALUATED:
      String(black).includes("NOT_EVALUATED") && String(presented).includes("NOT_EVALUATED"),
    // No-loading mid-slide contract: NO_SCREENCAST must never claim visual clean.
    NO_LOADING_MID_SLIDE_VISUAL_GATE: "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER",
    PERMANENT_ROLLOUT_NO_LOADING_VISUAL_ELIGIBLE: false,
    PERMANENT_ROLLOUT_REQUIRES_PIXEL_VISUAL_FOR_NO_LOADING: true,
  };
}

function evaluateWaapiPhysical(events, settleReason) {
  const selected = hasAnyKind(events, WAAPI_SELECTED_KINDS);
  const created = hasAnyKind(events, WAAPI_CREATED_KINDS);
  const ready = hasAnyKind(events, WAAPI_READY_KINDS);
  const started = hasAnyKind(events, WAAPI_STARTED_KINDS);
  const finishedNative = hasAnyKind(events, WAAPI_FINISHED_NATIVE_KINDS);
  const finishedPromoted = hasAnyKind(events, WAAPI_FINISHED_PROMOTED_KINDS);
  const finalStyles = hasAnyKind(events, WAAPI_FINAL_STYLES_KINDS);
  const physical =
    hasAnyKind(events, WAAPI_PHYSICAL_KINDS) ||
    events.some((e) => e?.physicalSatisfiedAfterEvent === true);
  const cancelBefore = countKinds(events, WAAPI_CANCEL_BEFORE_PHYSICAL_KINDS);
  const reject = countKinds(events, WAAPI_REJECT_KINDS);
  const unavailable = countKinds(events, WAAPI_UNAVAILABLE_KINDS);
  const logicalWithoutPhysical = countKinds(events, WAAPI_LOGICAL_WITHOUT_PHYSICAL_KINDS);

  const finishAccepted =
    finishedPromoted ||
    (finishedNative &&
      (settleReason == null ||
        !String(settleReason).includes("cancel") ||
        physical));

  const readyToFinishOk = ready && (started || finishAccepted);

  const physicalAccepted =
    selected &&
    created &&
    ready &&
    readyToFinishOk &&
    finishAccepted &&
    finalStyles &&
    physical &&
    cancelBefore === 0 &&
    reject === 0 &&
    unavailable === 0 &&
    logicalWithoutPhysical === 0;

  return {
    selected,
    created,
    ready,
    started,
    finishedNative,
    finishedPromoted,
    finishAccepted,
    finalStyles,
    physical,
    cancelBefore,
    reject,
    unavailable,
    logicalWithoutPhysical,
    PROD_HOP_CLASSIFIER_WAAPI_PHYSICAL_ACCEPTED: physicalAccepted,
    PROD_HOP_CLASSIFIER_CSS_TRANSITION_NOT_REQUIRED_IN_WAAPI: true,
  };
}

/**
 * Detailed prod hop classification.
 * @returns {{ status: string, diagnostics: object }}
 */
export function classifyProdHopDetailed(
  hopReport,
  rollbackOk,
  deliveryVerified,
  options = {},
) {
  const diagnostics = {
    PROD_HOP_CLASSIFIER_VERSION,
    PROD_HOP_CLASSIFIER_ROLLBACK_FALSE_REQUIRED: options.requireRollback !== false,
  };

  if (!deliveryVerified) {
    return { status: "PROD_SINGLE_HOP_INCOMPLETE", diagnostics };
  }
  if (hopReport?.status === "INVALID_SESSION" || hopReport?.reason === "session-not-ready") {
    return { status: "PROD_INVALID_SESSION_RETURNED", diagnostics };
  }
  if (
    hopReport?.PROD_TRUE_ARM_CONTEXT_INCOMPLETE ||
    hopReport?.PROD_TRUE_ARM_CONTEXT_INCOMPLETE === true
  ) {
    return { status: "PROD_FINAL_HOP_ABORTED_ARM_CONTEXT_INCOMPLETE", diagnostics };
  }
  if (
    hopReport?.OUTER_CAPTURE_ARM_DIVERGENCE === true ||
    hopReport?.PROD_TRUE_INPUT_ARM_REJECTION?.event === "OUTER_CAPTURE_ARM_DIVERGENCE"
  ) {
    return { status: "PROD_FINAL_HOP_ABORTED_ARM_CONTEXT_DIVERGENCE", diagnostics };
  }
  if (hopReport?.PROD_TRUE_INPUT_ARM_REJECTED) {
    return { status: "PROD_FINAL_HOP_ABORTED_ARM_REJECTED", diagnostics };
  }
  if (!hopReport) {
    return { status: "PROD_SINGLE_HOP_INCOMPLETE", diagnostics };
  }

  const inputInfo = countRealProdHopInputs({
    primaryHopReport: hopReport,
    secondaryHopReports: options.secondaryHopReports ?? [],
    reportLogicalInputCount: options.reportLogicalInputCount,
    reportPointerdownCount: options.reportPointerdownCount,
  });
  Object.assign(diagnostics, inputInfo);

  if (inputInfo.NO_REAL_INPUT) {
    return { status: "PROD_INPUT_NOT_EXECUTED", diagnostics };
  }
  if (inputInfo.TWO_OR_MORE_REAL_INPUTS) {
    return { status: "PROD_MORE_THAN_ONE_INPUT", diagnostics };
  }

  const ev = hopReport.hopNineEvidence ?? {};
  const bridge = hopReport.bridgeAudit ?? {};
  const native = hopReport.nativeLifecycleNoScreencastEvidence ?? {};
  const summary = hopReport.nativeLifecycleSummary ?? {};
  const post = hopReport.postHopOutsideCritical ?? {};
  const counters = hopReport.criticalCaptureCounters ?? {};
  const soft = hopReport.softNavEvidence ?? hopReport.microSlideSoftNav ?? {};
  const softDiag = hopReport.hopNineDiag?.softNavDiag ?? hopReport.softNavDiag ?? [];
  const obs =
    hopReport.softNavTraceObservability ??
    hopReport.hopNineEvidence?.softNavTraceObservability ??
    {};
  const allDiagEvents = collectDiagEvents(hopReport);
  const hasKind = (k) => allDiagEvents.some((e) => e.kind === k);
  const pinCount = (k) => allDiagEvents.filter((e) => e.kind === k).length;

  const motor = detectProdHopMotor(hopReport, allDiagEvents);
  Object.assign(diagnostics, motor);

  const visual = evaluateNoScreencastVisual(hopReport);
  Object.assign(diagnostics, visual);
  if (visual.NO_FAKE_VISUAL_ZEROS === false) {
    return { status: "PROD_SINGLE_HOP_FAIL", diagnostics };
  }

  const captureClean =
    (counters.cdpScreencastStartCountDuringCriticalWindow ?? 0) === 0 &&
    (counters.cdpScreencastFrameCountDuringCriticalWindow ?? 0) === 0 &&
    (counters.pageScreenshotCountDuringCriticalWindow ?? 0) === 0 &&
    (counters.externalCaptureLoopIterationsDuringCriticalWindow ?? 0) === 0 &&
    (counters.rafProbeCountDuringCriticalWindow ?? 0) === 0 &&
    (counters.computedStyleReadCountDuringCriticalWindow ?? 0) === 0 &&
    (counters.layoutReadCountDuringCriticalWindow ?? 0) === 0 &&
    (counters.sessionStorageWriteCountDuringCriticalWindow ?? 0) === 0;

  const commitMode =
    soft.effectiveCommitNavigationMode ??
    hopReport.hopNineDiag?.commitNavigationMode?.effectiveCommitNavigationMode ??
    hopReport.effectiveCommitNavigationMode ??
    (softKindCount(soft, softDiag, "MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED") > 0
      ? "soft"
      : null);

  const resolvedCommitMode =
    commitMode === "history" || commitMode === "soft"
      ? commitMode
      : softKindCount(soft, softDiag, "MICRO_SLIDE_HISTORY_PUSHSTATE_CALLED") > 0
        ? "history"
        : softKindCount(soft, softDiag, "MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED") > 0
          ? "soft"
          : commitMode;

  const historyNavPass =
    softKindCount(soft, softDiag, "MICRO_SLIDE_HISTORY_NAVIGATION_REQUIRED") >= 1 &&
    softKindCount(soft, softDiag, "MICRO_SLIDE_HARD_NAVIGATION_BYPASSED") >= 1 &&
    softKindCount(soft, softDiag, "MICRO_SLIDE_HISTORY_PUSHSTATE_CALLED") >= 1 &&
    softKindCount(soft, softDiag, "MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED") === 0 &&
    resolvedCommitMode === "history" &&
    (soft.hardNavigateMicroSlideCount ?? soft.hardNavigateCount ?? 0) === 0 &&
    (soft.windowLocationAssignCount ?? 0) === 0 &&
    (soft.runtimeRecreatedCount ?? soft.presentationRuntimeCreatedFreshAfterCommit ?? 0) ===
      0 &&
    (soft.legacyRevealExecutedCount ?? 0) === 0;

  const softNavPassLegacy =
    softKindCount(soft, softDiag, "MICRO_SLIDE_SOFT_NAVIGATION_REQUIRED") >= 1 &&
    softKindCount(soft, softDiag, "MICRO_SLIDE_HARD_NAVIGATION_BYPASSED") >= 1 &&
    softKindCount(soft, softDiag, "MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED") >= 1 &&
    resolvedCommitMode === "soft" &&
    (soft.hardNavigateMicroSlideCount ?? soft.hardNavigateCount ?? 0) === 0 &&
    (soft.windowLocationAssignCount ?? 0) === 0 &&
    (soft.runtimeRecreatedCount ?? soft.presentationRuntimeCreatedFreshAfterCommit ?? 0) ===
      0 &&
    (soft.legacyRevealExecutedCount ?? 0) === 0;

  const softNavPass = historyNavPass || softNavPassLegacy;

  const evalStatus =
    ev.currentHopEvaluationStatus ?? hopReport.currentHopEvaluationStatus ?? null;
  const softNavLabels = ev.softNavLabels ?? hopReport.softNavLabels ?? [];
  const softNavOutcome = ev.softNavOutcome ?? hopReport.softNavOutcome ?? null;

  const observabilityMergePass =
    obs?.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY === true ||
    obs?.mergePass?.invariants?.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY === true ||
    (obs?.pinDiagCaptured === true && (softDiag?.length ?? 0) > 0);

  const txPinPass =
    pinCount("MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT") >= 1 &&
    pinCount("MICRO_SLIDE_TX_SOFT_COMMIT_IN_FLIGHT") >= 1 &&
    pinCount("MICRO_SLIDE_TX_PIN_CLEARED") >= 1 &&
    (soft.legacyRevealExecutedCount ?? 0) === 0;

  // CSS-only: transition started but never ended.
  const startedNoEndCss =
    motor.PROD_HOP_CLASSIFIER_CSS_MODE &&
    (native.transitionstartCount ?? 0) > 0 &&
    (native.transitionendCount ?? 0) === 0 &&
    ((native.transitioncancelCount ?? 0) > 0 || (summary.watchdogSettleCount ?? 0) > 0);

  if (
    softNavPass &&
    (evalStatus === "SOFTNAV_TX_WITHOUT_MAIN_TRACE" ||
      evalStatus === "MAIN_TRACE_RESET_AFTER_SOFT_PUSH" ||
      softNavOutcome === "SOFTNAV_TX_WITH_TRACE_RESET" ||
      softNavLabels.includes("SOFTNAV_TX_CREATED_BUT_MAIN_TRACE_RESET") ||
      softNavLabels.includes("MAIN_TRACE_RING_RESET_AFTER_SOFT_PUSH"))
  ) {
    return { status: "PROD_SOFTNAV_TX_WITH_TRACE_RESET", diagnostics };
  }
  if (
    softNavPass &&
    (evalStatus === "SOFTNAV_TX_WITHOUT_PIN" ||
      softNavOutcome === "SOFTNAV_TX_WITHOUT_PIN" ||
      softNavLabels.includes("SOFTNAV_TX_WITHOUT_PIN_EVENT")) &&
    pinCount("MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT") === 0
  ) {
    return { status: "PROD_SOFTNAV_TX_WITHOUT_PIN_EVENT", diagnostics };
  }
  if (startedNoEndCss && softNavPass && txPinPass) {
    return { status: "PROD_NATIVE_TRANSITION_STARTED_BUT_DID_NOT_END", diagnostics };
  }
  if (
    softNavPass &&
    pinCount("MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT") >= 1 &&
    pinCount("MICRO_SLIDE_TX_PIN_CLEARED") === 0 &&
    (soft.legacyRevealExecutedCount ?? 0) > 0
  ) {
    return { status: "PROD_LEGACY_REVEAL_WHILE_PINNED_TX", diagnostics };
  }
  if (
    softNavPass &&
    pinCount("MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH") >= 1 &&
    pinCount("MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT") === 0
  ) {
    return { status: "PROD_TX_REHYDRATION_FAILED", diagnostics };
  }
  if (!softNavPass && (soft.windowLocationAssignCount ?? 0) > 0) {
    return { status: "PROD_SOFT_NAV_REGRESSION", diagnostics };
  }

  const fullTxResolved =
    evalStatus === "FULL_TX_RESOLVED" || Boolean(ev.currentHopTransactionIdResolved);

  const commonPass =
    softNavPass &&
    txPinPass &&
    fullTxResolved &&
    evalStatus === "FULL_TX_RESOLVED" &&
    ev.TRACE_BELONGS_TO_CURRENT_HOP === true &&
    Boolean(ev.currentHopTransactionIdResolved) &&
    hopReport.sourceTab === "chats" &&
    ev.ENGINE_SLIDE_OCCURRED === true &&
    ev.DOM_SLIDE_OCCURRED === true &&
    hasKind("PHASE_ARMED") &&
    hasKind("PHASE_SLIDING") &&
    hasKind("SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL") &&
    (bridge.bridgeStarted === true || hasKind("POST_SETTLE_ROUTE_BRIDGE_STARTED")) &&
    (bridge.BRIDGE_OWNER_SURFACE_PRESENTABLE !== false) &&
    (hasKind("FINAL_ROUTE_SURFACE_READY") || bridge.finalRouteReady === true) &&
    (hasKind("PRESENTATION_OWNERSHIP_TRANSFERRED") ||
      bridge.ownershipTransferred === true) &&
    (hasKind("POST_SETTLE_ROUTE_BRIDGE_COMPLETED") || bridge.bridgeCompleted === true) &&
    (bridge.loadingActuallyVisibleDuringBridge ?? 0) === 0 &&
    (hopReport.loadingShellVisibleFrameCount ?? 0) === 0 &&
    (hopReport.bugWindowFrameCount ?? 0) === 0 &&
    (hopReport.visibleRouteMismatchFrameCount ?? hopReport.routeMismatchFrameCount ?? 0) ===
      0 &&
    (post.pathname === "/shuffle" || hopReport.frameTable?.at(-1)?.pathname === "/shuffle") &&
    post.centeredLoadingVisible !== true &&
    post.blankOrRootSuspect !== true &&
    hopReport.RELEASE_HOP_CLEAN === true &&
    captureClean &&
    observabilityMergePass !== false;

  diagnostics.commonPass = commonPass;
  diagnostics.bridgeCompleted =
    bridge.bridgeCompleted === true || hasKind("POST_SETTLE_ROUTE_BRIDGE_COMPLETED");
  diagnostics.pinCleared = pinCount("MICRO_SLIDE_TX_PIN_CLEARED") >= 1;
  diagnostics.finalPathname = post.pathname ?? hopReport.frameTable?.at(-1)?.pathname ?? null;
  diagnostics.loadingShellVisibleFrameCount = hopReport.loadingShellVisibleFrameCount ?? 0;
  diagnostics.routeMismatchFrameCount =
    hopReport.visibleRouteMismatchFrameCount ?? hopReport.routeMismatchFrameCount ?? 0;

  let motorPass = false;
  if (motor.PROD_HOP_CLASSIFIER_WAAPI_MODE) {
    const waapi = evaluateWaapiPhysical(allDiagEvents, motor.settleReason);
    Object.assign(diagnostics, { waapi });
    motorPass = waapi.PROD_HOP_CLASSIFIER_WAAPI_PHYSICAL_ACCEPTED === true;
    // Explicitly do NOT require CSS transition* in WAAPI mode.
    diagnostics.PROD_HOP_CLASSIFIER_CSS_TRANSITION_NOT_REQUIRED_IN_WAAPI = true;
    diagnostics.cssTransitionRequired = false;
  } else {
    // CSS transition mode — preserve existing gates.
    diagnostics.cssTransitionRequired = true;
    diagnostics.PROD_HOP_CLASSIFIER_CSS_TRANSITION_NOT_REQUIRED_IN_WAAPI = false;
    motorPass =
      (native.transitionrunCount ?? 0) > 0 &&
      (native.transitionstartCount ?? 0) > 0 &&
      (native.transitionendCount ?? 0) > 0 &&
      (native.transitioncancelCount ?? 0) === 0 &&
      (summary.settleReason === "transitionend" || native.settleReason === "transitionend") &&
      (summary.watchdogSettleCount ?? 0) === 0 &&
      (summary.watchdogCallbackCount ?? 0) === 0 &&
      (hopReport.releaseChecks?.watchdogPreemptExpectedNativeEndFromStartCount ?? 0) === 0 &&
      (hopReport.releaseChecks?.watchdogPreemptWithinSlackFromStartCount ?? 0) === 0;
  }

  const rollbackRequired = options.requireRollback !== false;
  diagnostics.PROD_HOP_CLASSIFIER_ROLLBACK_FALSE_REQUIRED = rollbackRequired;
  diagnostics.rollbackOk = rollbackOk === true;

  const gatePass =
    commonPass &&
    motorPass &&
    (!rollbackRequired || rollbackOk === true);

  if (
    !hopReport.COMPLETE_HOP_CAPTURE &&
    !ev.TRACE_BELONGS_TO_CURRENT_HOP &&
    !ev.currentHopSoftNavTxId
  ) {
    return { status: "PROD_SINGLE_HOP_INCOMPLETE", diagnostics };
  }

  return {
    status: gatePass ? "PROD_SINGLE_HOP_CLEAN" : "PROD_SINGLE_HOP_FAIL",
    diagnostics,
  };
}

/** Back-compat wrapper used by prod hop runner. */
export function classifyProdHop(hopReport, rollbackOk, deliveryVerified, options = {}) {
  return classifyProdHopDetailed(hopReport, rollbackOk, deliveryVerified, options).status;
}
