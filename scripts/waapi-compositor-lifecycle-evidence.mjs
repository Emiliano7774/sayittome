/**
 * WAAPI compositor physical evidence for NO_SCREENCAST critical-window runs.
 * Authoritative for MAIN_TAB_SHUFFLE_WAAPI_COMPOSITOR_SLIDE native-shell history path.
 * Uses canonical terminal-state reducer so late fill-release cancels do not veto clean.
 */

import {
  reduceWaapiTerminalState,
  WAAPI_TERMINAL_STATE,
} from "./waapi-settle-terminal-state.mjs";

export const CAPTURE_PROVIDER = {
  NONE_DURING_CRITICAL_WINDOW: "NONE_DURING_CRITICAL_WINDOW",
};

export const PHYSICAL_EVIDENCE_PROVIDER_WAAPI_COMPOSITOR =
  "WAAPI_COMPOSITOR_LIFECYCLE_NO_SCREENCAST";

export const WAAPI_PRIMARY_STATUS = {
  WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_SATISFIED:
    "WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_SATISFIED",
  WAAPI_COMPOSITOR_ANIMATION_DID_NOT_START: "WAAPI_COMPOSITOR_ANIMATION_DID_NOT_START",
  WAAPI_COMPOSITOR_ANIMATION_DID_NOT_FINISH: "WAAPI_COMPOSITOR_ANIMATION_DID_NOT_FINISH",
  WAAPI_COMPOSITOR_ANIMATION_CANCELLED: "WAAPI_COMPOSITOR_ANIMATION_CANCELLED",
  WAAPI_COMPOSITOR_FINAL_STYLE_COMMIT_MISSING:
    "WAAPI_COMPOSITOR_FINAL_STYLE_COMMIT_MISSING",
  WAAPI_UNAVAILABLE_FOR_NATIVE_HISTORY_MICRO_SLIDE:
    "WAAPI_UNAVAILABLE_FOR_NATIVE_HISTORY_MICRO_SLIDE",
  WAAPI_COMPOSITOR_LOGICAL_SETTLE_WITHOUT_PHYSICAL_ANIMATION:
    "WAAPI_COMPOSITOR_LOGICAL_SETTLE_WITHOUT_PHYSICAL_ANIMATION",
  WAAPI_FINISHED_PROMOTED_WITH_CLEANUP_CANCEL_AFTER_PHYSICAL:
    "WAAPI_FINISHED_PROMOTED_WITH_CLEANUP_CANCEL_AFTER_PHYSICAL",
  CSS_TRANSITION_PROVIDER_NOT_USED_IN_WAAPI_MODE:
    "CSS_TRANSITION_PROVIDER_NOT_USED_IN_WAAPI_MODE",
};

function countKind(hopTrace, kind) {
  return (hopTrace || []).filter((e) => e.kind === kind).length;
}

export function hopUsesWaapiCompositorMotor(hopTrace = []) {
  return countKind(hopTrace, "MICRO_SLIDE_WAAPI_MOTOR_SELECTED") > 0;
}

function pickCanonicalSettleReason(hopTrace = [], settleReason = null) {
  const reduced = reduceWaapiTerminalState(hopTrace);
  if (reduced.settleReasonCanonical) return reduced.settleReasonCanonical;
  const settles = (hopTrace || []).filter(
    (e) => e.kind === "SETTLE_INITIATED" || e.kind === "SETTLED",
  );
  for (let i = settles.length - 1; i >= 0; i -= 1) {
    const r = settles[i]?.reason ?? settles[i]?.settleReason ?? settles[i]?.note ?? null;
    if (
      r === "waapi-finish" ||
      r === "end:waapi-finish" ||
      r === "waapi-watchdog-promoted-finish" ||
      String(r || "").includes("waapi-finish")
    ) {
      return String(r).includes("promoted") ? "waapi-watchdog-promoted-finish" : "waapi-finish";
    }
  }
  return settleReason || settles[0]?.reason || settles[0]?.note || null;
}

/**
 * WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID
 */
export function evaluateWaapiCompositorPhysicalEvidence({
  engineSlideOccurred = false,
  domSlideOccurred = false,
  hopTrace = [],
  settleReason = null,
  bridgeCompleted = false,
  pinCleared = false,
} = {}) {
  const reduced = reduceWaapiTerminalState(hopTrace);
  const selected = countKind(hopTrace, "MICRO_SLIDE_WAAPI_MOTOR_SELECTED") > 0;
  const keyframes = countKind(hopTrace, "MICRO_SLIDE_WAAPI_KEYFRAMES_PREPARED") > 0;
  const created = reduced.created || countKind(hopTrace, "MICRO_SLIDE_WAAPI_ANIMATION_CREATED") > 0;
  const ready = reduced.ready || countKind(hopTrace, "MICRO_SLIDE_WAAPI_ANIMATION_READY") > 0;
  const started =
    reduced.started || countKind(hopTrace, "MICRO_SLIDE_WAAPI_ANIMATION_STARTED") > 0;
  const finished =
    reduced.waapiFinishedNative ||
    reduced.waapiFinishedPromoted ||
    countKind(hopTrace, "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED") > 0;
  const finalStyles =
    reduced.finalStylesCommitted ||
    countKind(hopTrace, "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED") > 0;
  const physicalMarker =
    reduced.physicalSatisfied ||
    countKind(hopTrace, "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED") > 0 ||
    countKind(hopTrace, "MICRO_SLIDE_WAAPI_PHYSICAL_SATISFIED_CANONICAL") > 0;
  const rejected =
    reduced.rejected || countKind(hopTrace, "MICRO_SLIDE_WAAPI_ANIMATION_REJECTED") > 0;
  const unavailable =
    reduced.unavailable ||
    countKind(hopTrace, "MICRO_SLIDE_WAAPI_UNAVAILABLE_FALLBACK") > 0;

  const settle = pickCanonicalSettleReason(hopTrace, settleReason);
  const settleOk =
    settle === "waapi-finish" ||
    settle === "end:waapi-finish" ||
    settle === "waapi-watchdog-promoted-finish" ||
    (reduced.waapiCanonicalPhysicalSatisfied &&
      (reduced.waapiFinishedNative || reduced.waapiFinishedPromoted));

  const startOk = ready && (started || finished);
  const cancelBeforePhysical = reduced.rawCancelBeforePhysicalCount > 0;

  const canonicalPhysical =
    reduced.waapiCanonicalPhysicalSatisfied === true ||
    (selected &&
      keyframes &&
      created &&
      startOk &&
      finished &&
      finalStyles &&
      physicalMarker &&
      !cancelBeforePhysical &&
      !rejected &&
      !unavailable &&
      settleOk);

  const physicalSatisfied =
    canonicalPhysical === true &&
    engineSlideOccurred === true &&
    domSlideOccurred === true;

  let primaryFailureClass = null;
  if (unavailable) {
    primaryFailureClass = WAAPI_PRIMARY_STATUS.WAAPI_UNAVAILABLE_FOR_NATIVE_HISTORY_MICRO_SLIDE;
  } else if (cancelBeforePhysical) {
    primaryFailureClass = WAAPI_PRIMARY_STATUS.WAAPI_COMPOSITOR_ANIMATION_CANCELLED;
  } else if (created && !startOk) {
    primaryFailureClass = WAAPI_PRIMARY_STATUS.WAAPI_COMPOSITOR_ANIMATION_DID_NOT_START;
  } else if (created && startOk && !finished) {
    primaryFailureClass = WAAPI_PRIMARY_STATUS.WAAPI_COMPOSITOR_ANIMATION_DID_NOT_FINISH;
  } else if (finished && !finalStyles) {
    primaryFailureClass = WAAPI_PRIMARY_STATUS.WAAPI_COMPOSITOR_FINAL_STYLE_COMMIT_MISSING;
  } else if (
    !physicalSatisfied &&
    (bridgeCompleted || pinCleared || String(settle || "").includes("waapi") || String(settle || "").includes("watchdog"))
  ) {
    primaryFailureClass =
      WAAPI_PRIMARY_STATUS.WAAPI_COMPOSITOR_LOGICAL_SETTLE_WITHOUT_PHYSICAL_ANIMATION;
  }

  const valid = physicalSatisfied === true;
  const cleanupCancelStatus =
    valid &&
    reduced.waapiCleanupCancelAfterFinish &&
    reduced.waapiFinishedPromoted
      ? WAAPI_PRIMARY_STATUS.WAAPI_FINISHED_PROMOTED_WITH_CLEANUP_CANCEL_AFTER_PHYSICAL
      : null;

  return {
    NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID: valid,
    WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID: valid,
    PHYSICAL_EVIDENCE_PROVIDER_SELECTED: PHYSICAL_EVIDENCE_PROVIDER_WAAPI_COMPOSITOR,
    CAPTURE_PROVIDER_SELECTED: CAPTURE_PROVIDER.NONE_DURING_CRITICAL_WINDOW,
    CSS_TRANSITION_PROVIDER_NOT_USED_IN_WAAPI_MODE: true,
    waapiMotorSelected: selected,
    waapiKeyframesPrepared: keyframes,
    waapiAnimationsCreated: created,
    waapiReady: ready,
    waapiStarted: started,
    waapiFinished: finished,
    waapiFinalStylesCommitted: finalStyles,
    waapiPhysicalMarker: physicalMarker,
    // Clean-gate cancel count: only cancels before physical satisfaction.
    waapiCancelCount: reduced.rawCancelBeforePhysicalCount,
    waapiRejectCount: rejected ? 1 : 0,
    waapiUnavailable: unavailable,
    settleReason: settle,
    settleReasonCanonical: reduced.settleReasonCanonical || settle,
    waapiTerminalState: reduced.waapiTerminalState,
    waapiCanonicalPhysicalSatisfied: valid,
    waapiFinishedNative: reduced.waapiFinishedNative,
    waapiFinishedPromoted: reduced.waapiFinishedPromoted,
    waapiCleanupCancelAfterFinish: reduced.waapiCleanupCancelAfterFinish,
    waapiCancelBeforePhysical: cancelBeforePhysical,
    waapiPromoteAccepted: reduced.waapiPromoteAccepted,
    waapiPromoteRejected: reduced.waapiPromoteRejected,
    waapiFillReleaseCancelIgnored: reduced.waapiFillReleaseCancelIgnored,
    rawCancelCount: reduced.rawCancelCount,
    rawCancelAfterPhysicalCount: reduced.rawCancelAfterPhysicalCount,
    rawCancelBeforePhysicalCount: reduced.rawCancelBeforePhysicalCount,
    WAAPI_CANCEL_AFTER_FILL_RELEASE_IGNORED_FOR_CLEAN:
      reduced.WAAPI_CANCEL_AFTER_FILL_RELEASE_IGNORED_FOR_CLEAN === true,
    claimsExternalEvidence: false,
    PHYSICAL_NATIVE_TRANSITION_REQUIRED: false,
    PHYSICAL_WAAPI_COMPOSITOR_REQUIRED: true,
    PHYSICAL_WAAPI_COMPOSITOR_SATISFIED: valid,
    PHYSICAL_WAAPI_ANIMATION_REQUIRED: true,
    WAAPI_CANONICAL_PHYSICAL_SATISFIED: valid,
    primaryFailureClass: valid
      ? cleanupCancelStatus ||
        WAAPI_PRIMARY_STATUS.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_SATISFIED
      : primaryFailureClass,
    WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_SATISFIED: valid,
    WAAPI_TERMINAL_STATE: reduced.waapiTerminalState,
    cleanEligibleTerminal:
      reduced.waapiTerminalState === WAAPI_TERMINAL_STATE.FINISHED_NATIVE ||
      reduced.waapiTerminalState === WAAPI_TERMINAL_STATE.FINISHED_PROMOTED ||
      reduced.waapiTerminalState === WAAPI_TERMINAL_STATE.PHYSICAL_SATISFIED ||
      reduced.waapiTerminalState === WAAPI_TERMINAL_STATE.CLEANUP_CANCELLED_AFTER_FINISH,
  };
}

export function evaluateWaapiReleaseCleanExtras({
  currentHopEvaluationStatus = null,
  commitMode = null,
  phaseArmed = null,
  phaseSliding = null,
  watchdogSettleCount = 0,
  runtimeWipe = false,
  legacyReveal = false,
} = {}) {
  const hopOk =
    currentHopEvaluationStatus === "FULL_TX_RESOLVED" ||
    currentHopEvaluationStatus === "FULL_TX_RESOLVED_HISTORY_COMMIT";
  return {
    hopOk,
    commitModeHistory: commitMode === "history",
    phaseArmed: phaseArmed === true,
    phaseSliding: phaseSliding === true,
    watchdogSettleZero: watchdogSettleCount === 0,
    noRuntimeWipe: runtimeWipe !== true,
    noLegacyReveal: legacyReveal !== true,
  };
}
