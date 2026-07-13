/**
 * Native-lifecycle physical evidence for NO_SCREENCAST critical-window runs.
 * Explicit provider — does not claim external frame interpolation.
 */

export const CAPTURE_PROVIDER = {
  NONE_DURING_CRITICAL_WINDOW: "NONE_DURING_CRITICAL_WINDOW",
  CDP_SCREENCAST: "CDP_SCREENCAST",
  CDP_SCREENCAST_VISUAL_SPOT_CHECK: "CDP_SCREENCAST_VISUAL_SPOT_CHECK",
};

export const PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST =
  "NATIVE_TRANSITION_LIFECYCLE_NO_SCREENCAST";

/**
 * NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID
 * ENGINE + DOM + final inline + run + start + end(transform) +
 * elapsedTime coherent with 0.11s + cancel0 + settle=transitionend
 */
export function evaluateNoScreencastPhysicalEvidence({
  engineSlideOccurred = false,
  domSlideOccurred = false,
  finalInlineTargetCommitted = false,
  transitionEvents = [],
  hopTrace = [],
  settleReason = null,
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
  const settle =
    settleReason ||
    (hopTrace || []).find((e) => e.kind === "SETTLE_INITIATED" || e.kind === "SETTLED")?.reason ||
    (hopTrace || []).find((e) => e.kind === "SETTLED")?.note ||
    null;

  const runCount = Math.max(runs.length, appRuns.length);
  const startCount = Math.max(starts.length, appStarts.length);
  const endCount = Math.max(ends.length, appEnds.length);
  const cancelCount = cancels.length;

  const endEvent = ends[0] ?? null;
  const elapsedTime = endEvent?.elapsedTime ?? appEnds[0]?.elapsedTime;
  const elapsedCoherent =
    typeof elapsedTime === "number" && elapsedTime >= 0.08 && elapsedTime <= 0.2;

  // Physical end requires a real native transform end (provider events or app observation).
  // Do NOT accept bare TRANSITION_END / archive TE as a substitute when run/start are missing,
  // and do not count TE-from-trace alone as physical end evidence.
  const hasValidEnd = endCount > 0 && elapsedCoherent;
  const settleIsTe = settle === "transitionend" || settle === "end:transitionend";
  const neverStartedAfterFinalWrite =
    String(settle || "") === "transition-never-started-after-final-write";

  const valid =
    engineSlideOccurred === true &&
    domSlideOccurred === true &&
    finalInlineTargetCommitted === true &&
    runCount > 0 &&
    startCount > 0 &&
    hasValidEnd &&
    cancelCount === 0 &&
    settleIsTe &&
    !neverStartedAfterFinalWrite;

  return {
    NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID: valid,
    PHYSICAL_EVIDENCE_PROVIDER_SELECTED: PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST,
    CAPTURE_PROVIDER_SELECTED: CAPTURE_PROVIDER.NONE_DURING_CRITICAL_WINDOW,
    transitionrunCount: runCount,
    transitionstartCount: startCount,
    transitionendCount: endCount,
    transitioncancelCount: cancelCount,
    transitionendElapsedTime: elapsedTime ?? null,
    elapsedCoherent: endCount > 0 ? elapsedCoherent : false,
    settleReason: settle,
    claimsExternalEvidence: false,
    PHYSICAL_NATIVE_TRANSITION_REQUIRED: true,
    PHYSICAL_NATIVE_TRANSITION_SATISFIED: valid,
    neverStartedAfterFinalWrite,
  };
}

export function emptyCriticalCaptureCounters() {
  return {
    cdpScreencastStartCountDuringCriticalWindow: 0,
    cdpScreencastFrameCountDuringCriticalWindow: 0,
    pageScreenshotCountDuringCriticalWindow: 0,
    externalCaptureLoopIterationsDuringCriticalWindow: 0,
  };
}

export function assertNoScreencastCaptureClean(counters = {}) {
  const c = { ...emptyCriticalCaptureCounters(), ...counters };
  const ok =
    c.cdpScreencastStartCountDuringCriticalWindow === 0 &&
    c.cdpScreencastFrameCountDuringCriticalWindow === 0 &&
    c.pageScreenshotCountDuringCriticalWindow === 0 &&
    c.externalCaptureLoopIterationsDuringCriticalWindow === 0;
  return { ok, counters: c, CAPTURE_PROVIDER_SELECTED: CAPTURE_PROVIDER.NONE_DURING_CRITICAL_WINDOW };
}
