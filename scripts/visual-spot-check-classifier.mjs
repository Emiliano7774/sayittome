/**
 * Visual spot-check classifier — NOT a native transition timing gate.
 *
 * Loading defects must be destination/shuffle loading during SLIDE_CRITICAL or
 * BRIDGE_CRITICAL only. Source-panel "Cargando..." (chats keepalive empty state)
 * must not fail the spot check.
 */
import { classifyExternalFrames } from "./classify-minimal-physical.mjs";
import {
  CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST,
  CAPTURE_PROVIDER_SCREENSHOT_BURST,
  dedupeVisualFrames,
  detectTimestampCollapse,
  frameOrderKey,
  uniqueIdentityCount,
  uniquePresentedMonoCount,
} from "./visual-capture-frame-identity.mjs";

const TAB_INDEX = { stories: 0, chats: 1, shuffle: 2, boost: 3, settings: 4 };
const SOURCE_SURFACES = new Set(["chats", "stories", "boost", "settings"]);

export const CAPTURE_PROVIDER_VISUAL_SPOT_CHECK = CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST;
export const CAPTURE_PROVIDER_VISUAL_SPOT_CHECK_LEGACY = "CDP_SCREENCAST_VISUAL_SPOT_CHECK";
export {
  CAPTURE_PROVIDER_SCREENSHOT_BURST,
  CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST,
};

export function expectedDirectionForSource(source) {
  return TAB_INDEX[source] < TAB_INDEX.shuffle ? "from-right" : "from-left";
}

export function sourceExitDirection(expected) {
  return expected === "from-right" ? "left" : "right";
}

export function shuffleEnterDirection(expected) {
  return expected === "from-right" ? "right" : "left";
}

function asTrace(trace) {
  return Array.isArray(trace) ? trace : [];
}

function firstMono(trace, kind) {
  return asTrace(trace).find((e) => e?.kind === kind)?.monoMs ?? null;
}

/** Temporal windows for visual loading evaluation. */
export function classifyVisualTemporalWindow(mono, timeline) {
  if (mono == null || !timeline) return "UNKNOWN_WINDOW";
  const {
    pointerdownMono = null,
    phaseSlidingMono = null,
    transitionendMono = null,
    bridgeCompleteMono = null,
    latchReleaseMono = null,
    settleMono = null,
  } = timeline;
  const bridgeEnd = bridgeCompleteMono ?? latchReleaseMono;
  if (phaseSlidingMono != null && mono < phaseSlidingMono) {
    if (pointerdownMono == null || mono >= pointerdownMono - 50) return "PRE_SLIDE";
    return "PRE_SLIDE";
  }
  if (
    phaseSlidingMono != null &&
    transitionendMono != null &&
    mono >= phaseSlidingMono &&
    mono <= transitionendMono
  ) {
    return "SLIDE_CRITICAL";
  }
  if (
    transitionendMono != null &&
    bridgeEnd != null &&
    mono > transitionendMono &&
    mono <= bridgeEnd
  ) {
    return "BRIDGE_CRITICAL";
  }
  if (settleMono != null && mono > settleMono + 100) return "POST_SETTLE";
  if (transitionendMono != null && mono > transitionendMono) return "BRIDGE_CRITICAL";
  return "UNKNOWN_WINDOW";
}

export function buildVisualTimelineFromTrace(trace, pointerdownMono = null) {
  const t = asTrace(trace);
  const waapiStart =
    firstMono(t, "MICRO_SLIDE_WAAPI_ANIMATION_STARTED") ??
    firstMono(t, "MICRO_SLIDE_WAAPI_ANIMATION_CREATED");
  const waapiFinished =
    firstMono(t, "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED") ??
    firstMono(t, "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED") ??
    firstMono(t, "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED");
  const usesWaapi = t.some((e) => e?.kind === "MICRO_SLIDE_WAAPI_MOTOR_SELECTED");
  return {
    pointerdownMono,
    prepareMono: firstMono(t, "TRANSITION_BEGIN"),
    transactionBeginMono: firstMono(t, "TRANSITION_BEGIN"),
    phaseArmedMono: firstMono(t, "PHASE_ARMED"),
    phaseSlidingMono: firstMono(t, "PHASE_SLIDING"),
    finalWriteMono:
      firstMono(t, "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL") ??
      firstMono(t, "MICRO_SLIDE_WAAPI_ANIMATION_CREATED"),
    transitionrunMono: firstMono(t, "SLIDE_NATIVE_TRANSITION_RUN_OBSERVED"),
    transitionstartMono:
      firstMono(t, "SLIDE_NATIVE_TRANSITION_START_OBSERVED") ??
      firstMono(t, "SLIDE_TRANSITION_START_ANCHOR_COMMITTED") ??
      waapiStart,
    // WAAPI: prefer animation finish bounds over CSS TRANSITION_END.
    transitionendMono: usesWaapi
      ? waapiFinished ?? firstMono(t, "TRANSITION_END") ?? firstMono(t, "TRANSITION_END_RECEIVED")
      : firstMono(t, "TRANSITION_END") ?? firstMono(t, "TRANSITION_END_RECEIVED"),
    settleMono: firstMono(t, "SETTLED"),
    bridgeStartMono: firstMono(t, "POST_SETTLE_ROUTE_BRIDGE_STARTED"),
    bridgeCompleteMono: firstMono(t, "POST_SETTLE_ROUTE_BRIDGE_COMPLETED"),
    finalRouteReadyMono: firstMono(t, "FINAL_ROUTE_SURFACE_READY"),
    latchReleaseMono: firstMono(t, "PRESENTATION_LATCH_RELEASED"),
    waapiStartMono: waapiStart,
    waapiFinishedMono: waapiFinished,
    usesWaapi,
  };
}

function slideWindowFrames(frames, trace) {
  const t = asTrace(trace);
  const begin = firstMono(t, "TRANSITION_BEGIN");
  const settled = firstMono(t, "SETTLED");
  if (begin == null || settled == null) {
    return frames.filter(
      (f) =>
        f.geometry?.slideState === "running" ||
        f.geometry?.slideState === "armed" ||
        f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID",
    );
  }
  return frames.filter((f) => {
    const mono = f.framePresentedAtMono ?? null;
    if (mono == null) return false;
    return mono >= begin - 50 && mono <= settled + 100;
  });
}

function routeMismatchIsRealDefect(frame, trace) {
  const t = asTrace(trace);
  if (!frame.geometry?.routePresentationMismatch) return false;
  if (frame.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID") return false;
  const slideState = frame.geometry?.slideState;
  if (slideState === "preparing" || slideState === "armed" || slideState === "running") return false;
  const begin = t.find((e) => e.kind === "TRANSITION_BEGIN");
  const settled = t.find((e) => e.kind === "SETTLED");
  const mono = frame.framePresentedAtMono ?? 0;
  if (begin && settled && mono >= begin.monoMs && mono <= settled.monoMs + 500) return false;
  if ((frame.deltaFromPointerMs ?? 0) >= 0 && (frame.deltaFromPointerMs ?? 0) <= 900) return false;
  if (
    begin &&
    mono >= begin.monoMs &&
    frame.geometry?.actualPresentedSurface &&
    frame.geometry.actualPresentedSurface !== "none" &&
    (frame.geometry?.domSlots ?? 0) >= 3
  ) {
    return false;
  }
  return true;
}

function frameProgress(f) {
  const dSource = typeof f.dSource === "number" ? f.dSource : null;
  const dShuffle = typeof f.dShuffle === "number" ? f.dShuffle : null;
  if (dSource != null && dShuffle != null && dSource + dShuffle > 0) {
    return dSource / (dSource + dShuffle);
  }
  if (f.pixelClassification === "SOURCE_VALID") return 0;
  if (f.pixelClassification === "SHUFFLE_VALID") return 1;
  if (f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID") return 0.5;
  return null;
}

function progressSeriesUninformative(frames) {
  const progs = frames.map(frameProgress).filter((p) => typeof p === "number");
  if (progs.length < 2) return true;
  return Math.max(...progs) - Math.min(...progs) < 0.05;
}

function hasProgressBacktrack(frames, tolerance = 0.02) {
  const ordered = [...frames].sort((a, b) => frameOrderKey(a) - frameOrderKey(b));
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = frameProgress(ordered[i - 1]);
    const cur = frameProgress(ordered[i]);
    if (prev == null || cur == null) continue;
    if (cur + tolerance < prev) return true;
  }
  return false;
}

/** @deprecated timestamp-only dedupe — use dedupeVisualFrames */
function dedupeFramesByPresentedMono(frames) {
  return dedupeVisualFrames(frames);
}

function isNearSlideCriticalPreSlideRunning(frame, timeline) {
  if (frame.geometry?.slideState !== "running") return false;
  if (timeline.phaseSlidingMono == null || frame.framePresentedAtMono == null) return false;
  const mono = frame.framePresentedAtMono;
  // Capture often marks DOM "running" slightly before PHASE_SLIDING is traced.
  return mono < timeline.phaseSlidingMono && mono >= timeline.phaseSlidingMono - 400;
}

function countActiveWaapiFrames(frames, timeline) {
  const start = timeline.waapiStartMono ?? timeline.transitionstartMono ?? timeline.phaseSlidingMono;
  const end = timeline.waapiFinishedMono ?? timeline.transitionendMono ?? timeline.settleMono;
  if (start == null || end == null) return { active: [], controlledActive: [], expandedDueToCaptureSkew: false };
  // Tooling-only end skew: CDP screencast often delivers the last interpolated
  // compositor frames slightly after WAAPI finish/final-styles events.
  const endSkewMs = 80;
  const pick = (from, to) =>
    frames.filter((f) => {
      const mono = f.receiveMonoMs ?? f.cdpTimestampMs ?? f.framePresentedAtMono ?? null;
      if (mono == null) return false;
      return mono >= from && mono <= to;
    });
  let active = pick(start - 16, end + endSkewMs);
  let controlledActive = active.filter(
    (f) => f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID",
  );
  let expandedDueToCaptureSkew = false;
  if (
    uniqueIdentityCount(controlledActive) < 2 &&
    timeline.phaseSlidingMono != null &&
    timeline.settleMono != null
  ) {
    const expanded = pick(timeline.phaseSlidingMono - 16, timeline.settleMono + 120).filter(
      (f) => f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID",
    );
    if (uniqueIdentityCount(expanded) >= 2) {
      active = pick(timeline.phaseSlidingMono - 16, timeline.settleMono + 120);
      controlledActive = expanded;
      expandedDueToCaptureSkew = true;
    }
  }
  return { active, controlledActive, expandedDueToCaptureSkew };
}

function classifyVisualInterpolation(frames, trace, pointerdownMono = null) {
  const t = asTrace(trace);
  const timeline = buildVisualTimelineFromTrace(t, pointerdownMono);
  const evalFrames = frames.filter((f) => (f.deltaFromPointerMs ?? -1) >= 0);
  const begin = timeline.transactionBeginMono;
  const settled = timeline.settleMono;

  const visualFrames =
    begin != null && settled != null
      ? evalFrames.filter((f) => {
          const mono = f.framePresentedAtMono ?? 0;
          return mono >= begin - 50 && mono <= settled + 500;
        })
      : evalFrames;

  const controlled = visualFrames.filter((f) => f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID");
  const runningControlled = controlled.filter((f) => f.geometry?.slideState === "running");
  const { controlledActive, expandedDueToCaptureSkew } = countActiveWaapiFrames(evalFrames, timeline);

  // Monotonicity: SLIDE_CRITICAL + late PRE_SLIDE running (DOM ahead of PHASE_SLIDING trace).
  // WAAPI: also accept CONTROLLED frames inside animation start→finish bounds.
  // Never POST_SETTLE. Deduplicate identical screencast timestamps.
  const slideEvalControlled = dedupeFramesByPresentedMono(
    controlled.filter((f) => {
      const win = classifyVisualTemporalWindow(f.framePresentedAtMono, timeline);
      if (win === "SLIDE_CRITICAL") return true;
      if (win === "PRE_SLIDE" && isNearSlideCriticalPreSlideRunning(f, timeline)) return true;
      const mono = f.receiveMonoMs ?? f.cdpTimestampMs ?? f.framePresentedAtMono;
      if (
        timeline.usesWaapi &&
        timeline.waapiStartMono != null &&
        timeline.waapiFinishedMono != null &&
        mono != null &&
        mono >= timeline.waapiStartMono - 16 &&
        mono <= timeline.waapiFinishedMono + 80
      ) {
        return true;
      }
      if (
        expandedDueToCaptureSkew &&
        timeline.phaseSlidingMono != null &&
        timeline.settleMono != null &&
        mono != null &&
        mono >= timeline.phaseSlidingMono - 16 &&
        mono <= timeline.settleMono + 120 &&
        f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID"
      ) {
        return true;
      }
      return false;
    }),
  );
  const slideCriticalRunning = slideEvalControlled.filter(
    (f) => f.geometry?.slideState === "running" || f.geometry?.slideState == null,
  );

  const intermediateFrames =
    slideEvalControlled.length >= 2
      ? slideEvalControlled
      : runningControlled.length >= 2
        ? dedupeFramesByPresentedMono(runningControlled)
        : controlledActive.length >= 2
          ? dedupeFramesByPresentedMono(controlledActive)
          : [];

  const intermediateCount = intermediateFrames.length;

  const ordered = [...intermediateFrames].sort((a, b) => frameOrderKey(a) - frameOrderKey(b));
  let temporalMonotonic = ordered.length >= 2;
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = frameOrderKey(ordered[i - 1]);
    const cur = frameOrderKey(ordered[i]);
    if (cur + 0.5 < prev) {
      temporalMonotonic = false;
      break;
    }
  }
  const orderSpread =
    ordered.length >= 2 ? frameOrderKey(ordered[ordered.length - 1]) > frameOrderKey(ordered[0]) : false;
  const identitySpread = uniqueIdentityCount(ordered) >= 2;
  const temporalSpread = orderSpread || identitySpread;

  const hasShuffleAfter = visualFrames.some((f) => f.pixelClassification === "SHUFFLE_VALID");
  const ext = classifyExternalFrames(intermediateFrames);
  const flatProgress = progressSeriesUninformative(intermediateFrames);
  const backtrack = hasProgressBacktrack(intermediateFrames);
  const collapse = detectTimestampCollapse(controlledActive);

  const monotonic =
    intermediateCount >= 2 &&
    !backtrack &&
    (ext.monotonic ||
      (flatProgress && temporalMonotonic && temporalSpread) ||
      (temporalMonotonic && temporalSpread && (hasShuffleAfter || slideCriticalRunning.length >= 2)) ||
      (temporalMonotonic && identitySpread && intermediateCount >= 2));

  return {
    intermediateCount,
    monotonic,
    hasShuffleAfter,
    runningControlledCount: runningControlled.length,
    slideCriticalIntermediateCount: intermediateCount,
    temporalMonotonic,
    temporalSpread,
    identitySpread,
    progressUninformative: flatProgress,
    hadProgressBacktrack: backtrack,
    evaluationWindow: timeline.usesWaapi
      ? "WAAPI_START_FINISH_PLUS_SLIDE_CRITICAL"
      : "SLIDE_CRITICAL_PLUS_NEAR_PRE_SLIDE_RUNNING",
    waapiActiveControlledCount: controlledActive.length,
    waapiActiveUniqueTimestamps: uniquePresentedMonoCount(controlledActive),
    waapiActiveUniqueIdentities: uniqueIdentityCount(controlledActive),
    timestampCollapse: collapse,
    expandedDueToCaptureSkew: expandedDueToCaptureSkew === true,
    usesWaapi: timeline.usesWaapi === true,
  };
}

/**
 * Destination/shuffle loading defect only.
 * Bare loadingTextCount on source keepalive ("Cargando..." on chats) is NOT a defect.
 */
export function isVisualLoadingDefect(frame, windowName) {
  if (windowName !== "SLIDE_CRITICAL" && windowName !== "BRIDGE_CRITICAL") return false;
  const g = frame.geometry || {};
  const surface = g.actualPresentedSurface;

  // Explicit shuffle loading shell / gate
  if ((g.loadingShellCount ?? 0) > 0 || g.showShuffleLoading === true) return true;

  // Source-surface text (chats empty "Cargando...") never counts
  if (SOURCE_SURFACES.has(surface)) return false;

  // Controlled micro-slide frames are not loading defects from text alone
  if (frame.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID") return false;

  // Pixel LOADING on destination/unknown during critical windows
  if (frame.pixelClassification === "LOADING") {
    if (surface === "shuffle" || surface == null || surface === "none") return true;
    return false;
  }

  // Do not treat bare loadingTextCount as defect without shell/showShuffleLoading
  return false;
}

function routeMismatchDuringSlide(frame, trace) {
  return routeMismatchIsRealDefect(frame, asTrace(trace));
}

export function evaluateVisualSpotCheckHop(hop) {
  const frames = hop.frames ?? [];
  const trace = asTrace(hop.hopTraceForHop || hop.hopNineEvidence?.hopTrace || []);
  const sourceTab = hop.sourceTab;
  const expectedDirection = expectedDirectionForSource(sourceTab);
  const traceDirection =
    trace.find((e) => e.kind === "TRANSITION_BEGIN")?.direction ??
    trace.find((e) => e.direction)?.direction ??
    null;

  const timeline = buildVisualTimelineFromTrace(trace, hop.pointerdownMono ?? null);
  const windowFrames = slideWindowFrames(frames, trace).filter((f) => (f.deltaFromPointerMs ?? -1) >= 0);
  const visualMotion = classifyVisualInterpolation(frames, trace, hop.pointerdownMono ?? null);
  const directionCorrect = traceDirection === expectedDirection;

  const loadingRealFrames = windowFrames.filter((f) => {
    const win = classifyVisualTemporalWindow(f.framePresentedAtMono, timeline);
    return isVisualLoadingDefect(f, win);
  });
  const loadingShell = windowFrames.filter((f) => {
    const win = classifyVisualTemporalWindow(f.framePresentedAtMono, timeline);
    if (win !== "SLIDE_CRITICAL" && win !== "BRIDGE_CRITICAL") return false;
    return (f.geometry?.loadingShellCount ?? 0) > 0 || f.geometry?.showShuffleLoading === true;
  }).length;

  const bridgeOwnerInvalid = hop.bridgeAudit?.bridgeOwnerNotPresentableFrameCount ?? 0;
  const ownerNoneCritical = 0;
  const bugWindow = windowFrames.filter((f) => f.geometry?.bugWindowDuringSlide === true).length;
  const blackRootReal = windowFrames.filter(isRealBlackRootDuringSlide).length;
  const presentedNoneReal = windowFrames.filter(isRealPresentedNoneDuringSlide).length;
  const routeMismatch = windowFrames.filter((f) => routeMismatchDuringSlide(f, trace)).length;

  const bottomNavFixed = !windowFrames.some((f) => f.geometry?.validate?.bottomNav === false);

  const waapiSelected = trace.some((e) => e?.kind === "MICRO_SLIDE_WAAPI_MOTOR_SELECTED");
  const waapiCreated = trace.some((e) => e?.kind === "MICRO_SLIDE_WAAPI_ANIMATION_CREATED");
  const waapiStarted = trace.some((e) => e?.kind === "MICRO_SLIDE_WAAPI_ANIMATION_STARTED");
  const waapiFinished = trace.some(
    (e) =>
      e?.kind === "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED" ||
      e?.kind === "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED",
  );
  const settleNote =
    trace.find((e) => e.kind === "SETTLED")?.note ??
    trace.find((e) => e.kind === "SETTLE_INITIATED")?.reason ??
    null;
  const waapiNeverStarted =
    waapiSelected && !waapiCreated && !waapiStarted && !waapiFinished;

  const hasInterpolation = visualMotion.intermediateCount >= 2;
  const uniqueActive = visualMotion.waapiActiveUniqueIdentities ?? visualMotion.waapiActiveUniqueTimestamps ?? 0;
  const uniqueActiveMono = visualMotion.waapiActiveUniqueTimestamps ?? 0;
  const timestampCollapse =
    visualMotion.timestampCollapse?.VISUAL_CDP_TIMESTAMP_COLLAPSE_DETECTED === true;
  const insufficientActiveFrames =
    waapiSelected &&
    !waapiNeverStarted &&
    !hasInterpolation &&
    (visualMotion.waapiActiveControlledCount ?? 0) < 2 &&
    uniqueActive < 2;
  // Collapse alone is not a product snap: if identities >= 2 after robust dedupe, evaluate normally.
  const providerTimestampCollapseOnly =
    waapiSelected &&
    !waapiNeverStarted &&
    !hasInterpolation &&
    timestampCollapse &&
    uniqueActiveMono < 2 &&
    uniqueActive < 2 &&
    (visualMotion.waapiActiveControlledCount ?? 0) >= 2;
  const loadingReal = loadingRealFrames.length;

  const absoluteVisualFail =
    loadingReal > 0 ||
    loadingShell > 0 ||
    bridgeOwnerInvalid > 0 ||
    ownerNoneCritical > 0 ||
    bugWindow > 0 ||
    blackRootReal > 0 ||
    presentedNoneReal > 0 ||
    routeMismatch > 0 ||
    !directionCorrect ||
    !bottomNavFixed ||
    waapiNeverStarted ||
    insufficientActiveFrames ||
    providerTimestampCollapseOnly ||
    (!hasInterpolation && !waapiNeverStarted && !insufficientActiveFrames && !providerTimestampCollapseOnly) ||
    (hasInterpolation && !visualMotion.monotonic);

  let visualClassification = "VISUAL_SPOT_CHECK_PASS";
  // Hard visual defects take precedence over capture-insufficiency taxonomy.
  if (loadingReal > 0 || loadingShell > 0) {
    visualClassification = "VISUAL_LOADING_REAL";
  } else if (blackRootReal > 0) {
    visualClassification = "VISUAL_BLACK_ROOT";
  } else if (presentedNoneReal > 0) {
    visualClassification = "VISUAL_PRESENTED_NONE";
  } else if (routeMismatch > 0) {
    visualClassification = "VISUAL_ROUTE_MISMATCH";
  } else if (bugWindow > 0) {
    visualClassification = "VISUAL_BUG_WINDOW";
  } else if (bridgeOwnerInvalid > 0) {
    visualClassification = "VISUAL_BRIDGE_OWNER_INVALID";
  } else if (!directionCorrect) {
    visualClassification = "VISUAL_DIRECTION_INCORRECT";
  } else if (waapiNeverStarted) {
    visualClassification = "NOT_EVALUATED_WAAPI_NEVER_STARTED";
  } else if (providerTimestampCollapseOnly) {
    visualClassification = "VISUAL_PROVIDER_TIMESTAMP_COLLAPSE";
  } else if (insufficientActiveFrames) {
    visualClassification = "NOT_EVALUATED_INSUFFICIENT_ACTIVE_FRAMES";
  } else if (!hasInterpolation) {
    // True snap only when enough active identities exist to prove lack of intermediates.
    visualClassification =
      uniqueActive >= 2
        ? "VISUAL_NO_INTERPOLATION"
        : "NOT_EVALUATED_INSUFFICIENT_ACTIVE_FRAMES";
  } else if (visualMotion.hadProgressBacktrack) visualClassification = "VISUAL_NON_MONOTONIC_PROGRESS";
  else if (!visualMotion.monotonic) visualClassification = "VISUAL_NON_MONOTONIC_PROGRESS";
  else if (!bottomNavFixed) visualClassification = "VISUAL_BOTTOM_NAV_NOT_FIXED";

  const captureProvider =
    hop.VISUAL_CAPTURE_PROVIDER_SELECTED ||
    hop.CAPTURE_PROVIDER_SELECTED ||
    CAPTURE_PROVIDER_VISUAL_SPOT_CHECK;

  return {
    TIMING_ROBUSTNESS_GATE_ENABLED: false,
    CAPTURE_PROVIDER_SELECTED: captureProvider,
    VISUAL_CAPTURE_PROVIDER_SELECTED: captureProvider,
    VISUAL_CAPTURE_PROVIDER_FALLBACK_SELECTED: hop.VISUAL_CAPTURE_PROVIDER_FALLBACK_SELECTED ?? null,
    VISUAL_CDP_TIMESTAMP_COLLAPSE_DETECTED: timestampCollapse,
    VISUAL_PROVIDER_RELIABLE_ACTIVE_FRAMES: hasInterpolation && uniqueActive >= 2,
    VISUAL_PROVIDER_INSUFFICIENT_ACTIVE_FRAMES: insufficientActiveFrames || providerTimestampCollapseOnly,
    VISUAL_ACTIVE_FRAME_WINDOW_ALIGNED_TO_WAAPI: visualMotion.usesWaapi === true,
    sourceTab,
    expectedDirection,
    traceDirection,
    sourceExitDirection: sourceExitDirection(expectedDirection),
    shuffleEnterDirection: shuffleEnterDirection(expectedDirection),
    externalIntermediateFrameCount: visualMotion.intermediateCount,
    monotonicProgress: visualMotion.monotonic,
    directionCorrect,
    bottomNavFixed,
    bridgeOwnerNotPresentableCount: bridgeOwnerInvalid,
    loadingActuallyVisible: loadingReal,
    loadingShellVisible: loadingShell,
    ownerNoneCritical,
    bugWindow,
    blackRootReal,
    presentedNoneRealCritical: presentedNoneReal,
    visibleRouteMismatch: routeMismatch,
    visualClassification,
    clean: !absoluteVisualFail,
    visualMotionDetail: visualMotion,
    loadingWindowFilter: "SLIDE_CRITICAL|BRIDGE_CRITICAL",
    waapiSelected,
    waapiCreated,
    waapiStarted,
    waapiFinished,
    waapiNeverStarted,
    insufficientActiveFrames,
    providerTimestampCollapseOnly,
    settleNote,
    WAAPI_VISUAL_BOUNDS_USE_ANIMATION_EVENTS: waapiSelected === true,
    VISUAL_NO_INTERPOLATION_REQUIRES_ACTIVE_FRAMES: true,
  };
}

function isRealBlackRootDuringSlide(frame) {
  if (frame.pixelClassification !== "BLACK_OR_ROOT") return false;
  const slideState = frame.geometry?.slideState;
  return slideState === "running" || slideState === "armed";
}

function isRealPresentedNoneDuringSlide(frame) {
  // Controlled micro-slide frames are not "presented none" — surface may be unknown
  // when capture uses attribute-only geometry (no layout reads in critical window).
  if (frame.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID") return false;
  const surface = frame.geometry?.actualPresentedSurface;
  if (surface && surface !== "none") return false;
  const slideState = frame.geometry?.slideState;
  return slideState === "running" || slideState === "armed";
}

export function summarizeVisualSpotCheckSeries(hops) {
  const evaluated = hops.map((h) => h.visualSpotCheck ?? evaluateVisualSpotCheckHop(h));
  const clean = evaluated.filter((e) => e.clean).length;
  const dist = hops.reduce((acc, h) => {
    acc[h.sourceTab] = (acc[h.sourceTab] || 0) + 1;
    return acc;
  }, {});
  return {
    attempted: hops.length,
    clean,
    distribution: dist,
    VISUAL_SPOT_CHECK_SERIES_CLEAN: clean === hops.length && hops.length > 0,
    hops: evaluated,
  };
}

/**
 * NO_LOADING_MID_SLIDE_VISUAL_GATE
 *
 * Permanent rollout must not accept NO_SCREENCAST as visual-clean for this contract.
 * Direct cold /shuffle may show loading (DIRECT_COLD_LOADING_ALLOWED).
 */
export function evaluateNoLoadingMidSlideVisualGate(hop = {}) {
  const provider =
    hop.VISUAL_CAPTURE_PROVIDER_SELECTED ||
    hop.CAPTURE_PROVIDER_SELECTED ||
    hop.PHYSICAL_EVIDENCE_PROVIDER_SELECTED ||
    "";
  const isNoScreencast =
    /NO_SCREENCAST/i.test(String(provider)) ||
    hop.nativeLifecycleNoScreencastMode === true ||
    hop.PHYSICAL_EVIDENCE_PROVIDER_SELECTED === "WAAPI_COMPOSITOR_LIFECYCLE_NO_SCREENCAST";

  const entryMode = hop.entryMode || hop.navigationEntryMode || null;
  const isDirectCold =
    entryMode === "direct-cold" ||
    hop.DIRECT_COLD_SHUFFLE === true ||
    hop.sourceTab === "direct" ||
    hop.hopKind === "direct-cold-shuffle";

  if (isDirectCold) {
    return {
      gate: "NO_LOADING_MID_SLIDE_VISUAL_GATE",
      status: "DIRECT_COLD_LOADING_ALLOWED",
      clean: true,
      permanentRolloutEligible: true,
      reason: "direct-cold-entry-loading-allowed",
      provider,
    };
  }

  if (isNoScreencast) {
    return {
      gate: "NO_LOADING_MID_SLIDE_VISUAL_GATE",
      status: "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER",
      clean: false,
      permanentRolloutEligible: false,
      reason: "no-screencast-cannot-claim-no-loading-visual-clean",
      provider,
    };
  }

  const visual = hop.visualSpotCheck ?? (hop.frames ? evaluateVisualSpotCheckHop(hop) : null);
  const loadingText =
    (visual?.loadingActuallyVisible ?? 0) > 0 ||
    hop.destinationLoadingTextVisible === true ||
    hop.visibleCargandoDuringCritical === true;
  const loadingShell =
    (visual?.loadingShellVisible ?? 0) > 0 ||
    hop.destinationLoadingShellVisible === true ||
    (hop.loadingShellVisibleFrameCount ?? 0) > 0;
  const blackRootNotEvaluated =
    hop.blackRootEvaluationStatus === "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER" ||
    hop.blackRootCritical === "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER";
  const presentedNoneNotEvaluated =
    hop.presentedNoneEvaluationStatus === "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER" ||
    hop.presentedNoneCritical === "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER";

  if (blackRootNotEvaluated || presentedNoneNotEvaluated) {
    return {
      gate: "NO_LOADING_MID_SLIDE_VISUAL_GATE",
      status: "NOT_EVALUATED_BLACK_ROOT_OR_PRESENTED_NONE",
      clean: false,
      permanentRolloutEligible: false,
      reason: "black-root-or-presented-none-not-evaluated",
      provider,
    };
  }

  if (loadingText || loadingShell) {
    return {
      gate: "NO_LOADING_MID_SLIDE_VISUAL_GATE",
      status: "NO_LOADING_MID_SLIDE_FAIL",
      clean: false,
      permanentRolloutEligible: false,
      reason: loadingText ? "visible-cargando-destination" : "destination-loading-shell",
      provider,
      loadingText,
      loadingShell,
    };
  }

  if (visual && visual.clean === false) {
    return {
      gate: "NO_LOADING_MID_SLIDE_VISUAL_GATE",
      status: visual.visualClassification || "VISUAL_FAIL",
      clean: false,
      permanentRolloutEligible: false,
      reason: "visual-spot-check-dirty",
      provider,
    };
  }

  if (!visual && hop.VISUAL_SPOT_CHECK_CLEAN !== true) {
    return {
      gate: "NO_LOADING_MID_SLIDE_VISUAL_GATE",
      status: "NOT_EVALUATED_FRESH_ANON_VISUAL_REQUIRED",
      clean: false,
      permanentRolloutEligible: false,
      reason: "fresh-anon-visual-gate-not-run",
      provider,
    };
  }

  return {
    gate: "NO_LOADING_MID_SLIDE_VISUAL_GATE",
    status: "NO_LOADING_MID_SLIDE_PASS",
    clean: true,
    permanentRolloutEligible: true,
    reason: "no-loading-mid-slide-clean",
    provider,
  };
}

export function evaluatePermanentRolloutNoLoadingGate(report = {}) {
  const hops = report.hops || report.hopReports || [];
  const freshAnonRequired = report.freshAnonVisualGateRun === true || hops.some((h) => h.freshAnon === true);
  if (!freshAnonRequired && report.requireFreshAnonVisual !== false) {
    return {
      PERMANENT_ROLLOUT_NO_LOADING_GATE: false,
      status: "NOT_EVALUATED_FRESH_ANON_VISUAL_REQUIRED",
      reason: "fresh-anon-visual-gate-not-run",
    };
  }
  const results = hops.map((h) => evaluateNoLoadingMidSlideVisualGate(h));
  const blocked = results.filter((r) => !r.permanentRolloutEligible);
  return {
    PERMANENT_ROLLOUT_NO_LOADING_GATE: blocked.length === 0 && results.length > 0,
    status: blocked[0]?.status || "NO_LOADING_MID_SLIDE_PASS",
    blocked,
    results,
  };
}
