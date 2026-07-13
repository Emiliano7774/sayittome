/**
 * Pure model for WAAPI compositor slide motor (tooling).
 */

export const WAAPI_DURATION_MS = 110;
export const WAAPI_EASING = "cubic-bezier(0.2, 0.72, 0.2, 1)";

export function waapiKeyframesForDirection(direction) {
  if (direction === "from-right") {
    return {
      source: ["translate3d(0, 0, 0)", "translate3d(-100%, 0, 0)"],
      destination: ["translate3d(100%, 0, 0)", "translate3d(0, 0, 0)"],
    };
  }
  return {
    source: ["translate3d(0, 0, 0)", "translate3d(100%, 0, 0)"],
    destination: ["translate3d(-100%, 0, 0)", "translate3d(0, 0, 0)"],
  };
}

export function shouldSelectWaapiMotor({
  waapiFlag = true,
  microSlideEnabled = true,
  isNativeAppShell = true,
  reducedMotion = false,
} = {}) {
  if (!waapiFlag || !microSlideEnabled || !isNativeAppShell || reducedMotion) return false;
  return true;
}

export function simulateWaapiCompositorSlide(input = {}) {
  const {
    waapiFlag = true,
    microSlideEnabled = true,
    isNativeAppShell = true,
    reducedMotion = false,
    animateAvailable = true,
    readyResolves = true,
    finishResolves = true,
    cancelBeforeFinish = false,
    rejectReady = false,
    rejectFinish = false,
    commitFinalStyles = true,
    bridgeComplete = true,
    pinClear = true,
    direction = "from-right",
    durationMs = WAAPI_DURATION_MS,
    easing = WAAPI_EASING,
    staleDuringReady = false,
  } = input;

  const selected = shouldSelectWaapiMotor({
    waapiFlag,
    microSlideEnabled,
    isNativeAppShell,
    reducedMotion,
  });
  const keyframes = waapiKeyframesForDirection(direction);

  if (!selected) {
    return {
      selected: false,
      releaseClean: false,
      reason: "waapi-not-selected",
      durationMs,
      easing,
      keyframes,
    };
  }

  if (!animateAvailable) {
    return {
      selected: true,
      unavailable: true,
      releaseClean: false,
      primaryFailureClass: "WAAPI_UNAVAILABLE_FOR_NATIVE_HISTORY_MICRO_SLIDE",
      durationMs,
      easing,
      keyframes,
    };
  }

  if (staleDuringReady) {
    return {
      selected: true,
      staleAbort: true,
      pinCleared: true,
      releaseClean: false,
      primaryFailureClass: "MICRO_SLIDE_WAAPI_STALE_TX_ABORT",
      durationMs,
      easing,
      keyframes,
    };
  }

  const created = true;
  const ready = readyResolves && !rejectReady;
  const cancelled = cancelBeforeFinish === true;
  const finished = !cancelled && finishResolves && !rejectFinish && ready;
  const finalStyles = finished && commitFinalStyles === true;
  const physical =
    created && ready && finished && finalStyles && !cancelled && !rejectReady && !rejectFinish;

  let primaryFailureClass = null;
  if (rejectReady || (!ready && created)) {
    primaryFailureClass = "WAAPI_COMPOSITOR_ANIMATION_DID_NOT_START";
  } else if (cancelled) {
    primaryFailureClass = "WAAPI_COMPOSITOR_ANIMATION_CANCELLED";
  } else if (!finished) {
    primaryFailureClass = "WAAPI_COMPOSITOR_ANIMATION_DID_NOT_FINISH";
  } else if (!finalStyles) {
    primaryFailureClass = "WAAPI_COMPOSITOR_FINAL_STYLE_COMMIT_MISSING";
  } else if (!physical && (bridgeComplete || pinClear)) {
    primaryFailureClass = "WAAPI_COMPOSITOR_LOGICAL_SETTLE_WITHOUT_PHYSICAL_ANIMATION";
  }

  const releaseClean =
    physical &&
    bridgeComplete === true &&
    pinClear === true &&
    durationMs === WAAPI_DURATION_MS &&
    easing === WAAPI_EASING;

  return {
    selected: true,
    created,
    ready,
    finished,
    finalStyles,
    cancelled,
    physicalSatisfied: physical,
    bridgeComplete,
    pinClear,
    releaseClean,
    primaryFailureClass: releaseClean
      ? "WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_SATISFIED"
      : primaryFailureClass,
    durationMs,
    easing,
    keyframes,
    NO_CSS_TRANSITION_REQUIRED_IN_WAAPI_MODE: true,
  };
}
