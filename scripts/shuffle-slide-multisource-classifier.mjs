/**
 * Multi-source shuffle slide classifier — Node authority for release tooling.
 * Does not touch the transition motor; consumes trace / DOM / RAF / screencast probes.
 */

import {
  absoluteSafetyGatesPass,
  resolveReleasePhysicalEvidence,
  releaseHopCleanMinimalFormula,
  PHYSICAL_EVIDENCE_PROVIDER,
} from "./minimal-release-physical-evidence.mjs";
import { resolveSoftNavAwareCurrentHop } from "./softnav-tx-trace-observability.mjs";
import {
  evaluateNativeTransitionStartGate,
  PRIMARY_STATUS as NATIVE_START_PRIMARY_STATUS,
  FAILURE_FAMILY as NATIVE_START_FAILURE_FAMILY,
} from "./native-transition-start-gate.mjs";
import {
  evaluateWaapiCompositorPhysicalEvidence,
  hopUsesWaapiCompositorMotor,
  PHYSICAL_EVIDENCE_PROVIDER_WAAPI_COMPOSITOR,
  WAAPI_PRIMARY_STATUS,
} from "./waapi-compositor-lifecycle-evidence.mjs";

export const CLASSIFICATION = {
  CAPTURE_MISSED_SHORT_SLIDE: "CAPTURE_MISSED_SHORT_SLIDE",
  SLIDE_CONFIRMED_ALL_SOURCES: "SLIDE_CONFIRMED_ALL_SOURCES",
  ENGINE_DID_NOT_SLIDE: "ENGINE_DID_NOT_SLIDE",
  DOM_STAGE_MARKER_DIVERGENCE: "DOM_STAGE_MARKER_DIVERGENCE",
  TRANSFORM_NOT_ANIMATED: "TRANSFORM_NOT_ANIMATED",
  /** Precise primary under TRANSFORM_NOT_ANIMATED family (native no-screencast). */
  NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE:
    NATIVE_START_PRIMARY_STATUS.NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE,
  FINAL_WRITE_DID_NOT_CHANGE_TRANSFORM:
    NATIVE_START_PRIMARY_STATUS.FINAL_WRITE_DID_NOT_CHANGE_TRANSFORM,
  TARGET_ALREADY_AT_FINAL_TRANSFORM: NATIVE_START_PRIMARY_STATUS.TARGET_ALREADY_AT_FINAL_TRANSFORM,
  CSS_TRANSITION_NOT_APPLIED_AFTER_FINAL_WRITE:
    NATIVE_START_PRIMARY_STATUS.CSS_TRANSITION_NOT_APPLIED_AFTER_FINAL_WRITE,
  TRANSITION_TARGET_NOT_RENDERABLE_AT_FINAL_WRITE:
    NATIVE_START_PRIMARY_STATUS.TRANSITION_TARGET_NOT_RENDERABLE_AT_FINAL_WRITE,
  NATIVE_TRANSITION_PROVIDER_TARGET_MISMATCH:
    NATIVE_START_PRIMARY_STATUS.NATIVE_TRANSITION_PROVIDER_TARGET_MISMATCH,
  NATIVE_TRANSITION_STARTED_BUT_DID_NOT_END:
    NATIVE_START_PRIMARY_STATUS.NATIVE_TRANSITION_STARTED_BUT_DID_NOT_END,
  NATIVE_TRANSITION_LIFECYCLE_INCOMPLETE:
    NATIVE_START_PRIMARY_STATUS.NATIVE_TRANSITION_LIFECYCLE_INCOMPLETE,
  NATIVE_TRANSITION_END_WITHOUT_RUN_OR_START:
    NATIVE_START_PRIMARY_STATUS.NATIVE_TRANSITION_END_WITHOUT_RUN_OR_START,
  FAIL_LOADING_VISIBLE: "FAIL_LOADING_VISIBLE",
  FAIL_BUG_WINDOW: "FAIL_BUG_WINDOW",
  FAIL_BLACK_ROOT: "FAIL_BLACK_ROOT",
  FAIL_PRESENTED_NONE: "FAIL_PRESENTED_NONE",
  OTHER_PROVEN_CAUSE: "OTHER_PROVEN_CAUSE",
};

export { NATIVE_START_PRIMARY_STATUS, NATIVE_START_FAILURE_FAMILY };

export const TRACE_BELONGS_REASON = {
  CURRENT_HOP_TX_RESOLVED: "CURRENT_HOP_TX_RESOLVED",
  NO_CURRENT_HOP_TX_CANDIDATE: "NO_CURRENT_HOP_TX_CANDIDATE",
  AMBIGUOUS_CURRENT_HOP_TRANSACTION: "AMBIGUOUS_CURRENT_HOP_TRANSACTION",
  ROUTER_NAV_CHAIN_MISSING: "ROUTER_NAV_CHAIN_MISSING",
  SOURCE_PATH_MISMATCH: "SOURCE_PATH_MISMATCH",
  TRACE_RING_CHANGED_WITHOUT_RECOVERY: "TRACE_RING_CHANGED_WITHOUT_RECOVERY",
  RAW_BASELINE_UNAVAILABLE: "RAW_BASELINE_UNAVAILABLE",
};

const HARD_FAIL_CLASSIFICATIONS = new Set([
  CLASSIFICATION.FAIL_LOADING_VISIBLE,
  CLASSIFICATION.FAIL_BUG_WINDOW,
  CLASSIFICATION.FAIL_BLACK_ROOT,
  CLASSIFICATION.FAIL_PRESENTED_NONE,
  CLASSIFICATION.ENGINE_DID_NOT_SLIDE,
  CLASSIFICATION.DOM_STAGE_MARKER_DIVERGENCE,
  CLASSIFICATION.TRANSFORM_NOT_ANIMATED,
]);

const CONTROL_EVENT_KINDS = new Set([
  "PREPARE_WARM_NAV_CALLED",
  "COMPLETE_WARM_NAV_CALLED",
  "ROUTER_NAV_CALLED",
  "NAVIGATION_COMMIT_NOTIFIED",
  "ROUTE_PATHNAME_OBSERVED_CHANGED",
  "LEGACY_REVEAL_ATTEMPT",
  "LEGACY_REVEAL_EXECUTED",
  "LEGACY_REVEAL_BLOCKED",
]);

export function parseMatrixTranslateX(transform) {
  if (!transform || transform === "none") return null;
  const matrix3d = transform.match(/matrix3d\(([^)]+)\)/);
  if (matrix3d) {
    const parts = matrix3d[1].split(",").map((part) => Number.parseFloat(part.trim()));
    return Number.isFinite(parts[12]) ? parts[12] : null;
  }
  const matrix = transform.match(/matrix\(([^)]+)\)/);
  if (!matrix) return null;
  const parts = matrix[1].split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 6) return null;
  return Number.isFinite(parts[4]) ? parts[4] : null;
}

export function normalizeTransformSample(sample) {
  if (!sample || typeof sample !== "object") return null;
  const sourceTransform = sample.sourceTransform ?? null;
  const destinationTransform = sample.destinationTransform ?? null;
  return {
    monoMs: sample.monoMs ?? null,
    sourceTransform,
    destinationTransform,
    sourceX: sample.sourceX ?? parseMatrixTranslateX(sourceTransform),
    destinationX: sample.destinationX ?? parseMatrixTranslateX(destinationTransform),
    slideDatasetValue: sample.slideDatasetValue ?? sample.slideValue ?? null,
  };
}

export function entryTransactionId(entry) {
  if (!entry || typeof entry !== "object") return null;
  return (
    entry.transactionId ??
    entry.txId ??
    entry.scheduledTransactionId ??
    entry.currentTransactionId ??
    null
  );
}

export function captureRawTraceBaseline(trace) {
  if (!Array.isArray(trace)) {
    return {
      rawTraceBaselineEventCount: 0,
      rawTraceBaselineLastMono: null,
      rawTraceBaselineRingInstanceId: null,
      rawTraceBaselineModuleInstanceIds: [],
      CURRENT_HOP_BASELINE_READS_RAW_TRACE: true,
    };
  }
  const last = trace.length > 0 ? trace[trace.length - 1] : null;
  const moduleIds = new Set();
  for (const entry of trace) {
    const id = entry?.moduleInstanceId || entry?.transitionModuleInstanceId;
    if (id) moduleIds.add(id);
  }
  const ringId =
    last?.traceRingInstanceId ??
    trace.find((entry) => entry?.traceRingInstanceId)?.traceRingInstanceId ??
    null;
  return {
    rawTraceBaselineEventCount: trace.length,
    rawTraceBaselineLastMono: last?.monoMs ?? null,
    rawTraceBaselineRingInstanceId: ringId,
    rawTraceBaselineModuleInstanceIds: [...moduleIds],
    CURRENT_HOP_BASELINE_READS_RAW_TRACE: true,
  };
}

function resolveUpperBound(captureEndMono, nextHopCaptureStartMono) {
  if (captureEndMono != null && Number.isFinite(captureEndMono)) return captureEndMono;
  if (nextHopCaptureStartMono != null && Number.isFinite(nextHopCaptureStartMono)) {
    return nextHopCaptureStartMono;
  }
  return Infinity;
}

function inHopWindow(entry, captureStartMono, upperBound) {
  const mono = entry?.monoMs;
  if (mono == null || !Number.isFinite(mono)) return false;
  if (mono < captureStartMono) return false;
  if (mono >= upperBound) return false;
  return true;
}

export function matchesSourceTab(entry, sourceTab, transactionId = null) {
  if (!sourceTab) return true;
  const src = String(entry?.source || "").trim();
  if (src === sourceTab) return true;
  const path = String(entry?.pathname || entry?.fromPath || "").trim();
  if (path === `/${sourceTab}`) return true;
  const detail = String(entry?.detail || "");
  if (detail.includes(`fromPath=/${sourceTab}`) || detail.includes(`source=${sourceTab}`)) {
    return true;
  }
  const tx = transactionId ?? entryTransactionId(entry);
  if (tx && tx.includes(`_${sourceTab}`)) return true;
  return false;
}

export function parseNavInputChain(navInputEvents, captureStartMono) {
  const events = (navInputEvents ?? []).filter((entry) => (entry.monoMs ?? 0) >= captureStartMono);
  const pointerdown = events.find((entry) => entry.kind === "NAV_INPUT_POINTERDOWN") ?? null;
  const click = events.find((entry) => entry.kind === "NAV_INPUT_CLICK") ?? null;
  const complete = events.find((entry) => entry.kind === "COMPLETE_WARM_NAV_CALLED") ?? null;
  const router =
    [...events]
      .reverse()
      .find(
        (entry) =>
          entry.kind === "ROUTER_NAV_CALLED" &&
          String(entry.detail || entry.target || entry.href || "").includes("/shuffle"),
      ) ?? null;
  return { events, pointerdown, click, complete, router };
}

export function syntheticNavChainIfMissing(navInputEvents, pointerdownMono, captureStartMono, sourceTab = "chats") {
  if (Array.isArray(navInputEvents) && navInputEvents.length > 0) return navInputEvents;
  const pd = pointerdownMono > 0 ? pointerdownMono : captureStartMono + 30;
  return [
    { kind: "NAV_INPUT_POINTERDOWN", monoMs: pd, pathname: `/${sourceTab}` },
    { kind: "NAV_INPUT_CLICK", monoMs: pd + 5, pathname: `/${sourceTab}` },
    {
      kind: "COMPLETE_WARM_NAV_CALLED",
      monoMs: pd + 5,
      navSeq: 2,
      detail: `fromPath=/${sourceTab}`,
    },
    {
      kind: "ROUTER_NAV_CALLED",
      monoMs: pd + 10,
      navSeq: 2,
      detail: `href=/shuffle|fromPath=/${sourceTab}`,
    },
  ];
}

function wasTransactionAbortedBefore(trace, transactionId, beforeMono) {
  if (!transactionId || beforeMono == null) return false;
  return trace.some(
    (entry) =>
      entryTransactionId(entry) === transactionId &&
      entry.kind === "ABORTED" &&
      entry.monoMs != null &&
      entry.monoMs < beforeMono,
  );
}

function scoreTransactionCandidate(trace, transactionId, routerMono, sourceTab, pointerdownMono) {
  const txEvents = trace.filter((entry) => entryTransactionId(entry) === transactionId);
  const begin = txEvents.find((entry) => entry.kind === "TRANSITION_BEGIN");
  const rehydrated = txEvents.some(
    (entry) =>
      entry.kind === "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT" ||
      String(entry.note || "").includes("rehydrated-after-module-reinit"),
  );
  if (!begin || begin.monoMs == null) return null;
  if (!matchesSourceTab(begin, sourceTab, transactionId)) return null;
  // Normal path: begin must precede router. Rehydrated txs intentionally emit begin after soft push.
  if (routerMono != null && begin.monoMs > routerMono && !rehydrated) return null;
  if (wasTransactionAbortedBefore(trace, transactionId, pointerdownMono)) return null;

  const hasSliding = txEvents.some((entry) => entry.kind === "PHASE_SLIDING");
  const hasSettled = txEvents.some((entry) => entry.kind === "SETTLED");
  const hasCommit = txEvents.some((entry) => entry.kind === "NAVIGATION_COMMIT_NOTIFIED");
  const hasArmed = txEvents.some((entry) => entry.kind === "PHASE_ARMED");
  if (!hasSliding && !hasSettled) return null;

  const routerDelta = routerMono != null ? routerMono - begin.monoMs : 0;
  let score = 0;
  score += 1000;
  score += hasSliding ? 100 : 0;
  score += hasSettled ? 50 : 0;
  score += hasCommit ? 25 : 0;
  score += hasArmed ? 10 : 0;
  score += rehydrated ? 15 : 0;
  score -= rehydrated ? 0 : routerDelta;

  return {
    transactionId,
    beginMono: begin.monoMs,
    score,
    hasSliding,
    hasSettled,
    rehydrated,
  };
}

export function resolveCurrentHopTransaction(trace, options = {}) {
  const {
    captureStartMono = 0,
    captureEndMono = null,
    nextHopCaptureStartMono = null,
    sourceTab = null,
    navInputEvents = [],
    pointerdownMono = 0,
    rawTraceBaseline = null,
    softNavDiag = null,
    traceArchive = null,
    pinDiag = null,
    runtimeLifecycle = null,
    pinDiagCaptured = null,
  } = options;

  const softNavAwareExtras =
    softNavDiag != null ||
    traceArchive != null ||
    pinDiag != null ||
    runtimeLifecycle != null;

  const attachSoftNav = (base) => {
    if (!softNavAwareExtras) return base;
    const soft = resolveSoftNavAwareCurrentHop({
      mainTraceCurrent: Array.isArray(trace) ? trace : [],
      softNavDiag: softNavDiag ?? [],
      traceArchive,
      pinDiag: pinDiag ?? (pinDiagCaptured === false ? "MISSING" : null),
      pinDiagCaptured,
      runtimeLifecycle: runtimeLifecycle ?? [],
      navInputDiag: navInputEvents,
      captureStartMono,
    });
    return {
      ...base,
      softNavAware: soft,
      currentHopSoftNavTxId: soft.currentHopSoftNavTxId,
      currentHopSoftNavPhase: soft.currentHopSoftNavPhase,
      currentHopSoftNavActiveTx: soft.currentHopSoftNavActiveTx,
      currentHopSoftNavTxCount: soft.currentHopSoftNavTxCount,
      currentHopMainTraceTxCount: soft.currentHopMainTraceTxCount,
      currentHopMainTraceLength: soft.currentHopMainTraceLength,
      currentHopArchivedTraceLength: soft.currentHopArchivedTraceLength,
      currentHopPinEventCount: soft.currentHopPinEventCount,
      currentHopEvaluationStatus: soft.evaluationStatus,
      traceResetAfterSoftPush: soft.traceResetAfterSoftPush,
      runtimeCreatedAfterSoftPush: soft.runtimeCreatedAfterSoftPush,
      legacyRevealAfterReset: soft.legacyRevealAfterReset,
      softNavLabels: soft.labels,
      softNavOutcome: soft.outcome,
      softNavInvariants: soft.invariants,
      // Soft-nav TX present: never leave transactionId null as generic empty.
      transactionId: base.transactionId ?? soft.transactionId,
      reason:
        !base.transactionId && soft.transactionId
          ? soft.reason
          : base.reason,
      resolutionReason:
        !base.transactionId && soft.transactionId
          ? soft.evaluationStatus
          : base.resolutionReason,
    };
  };

  const upperBound = resolveUpperBound(captureEndMono, nextHopCaptureStartMono);

  if (!Array.isArray(trace) || trace.length === 0) {
    return attachSoftNav({
      transactionId: null,
      reason: TRACE_BELONGS_REASON.NO_CURRENT_HOP_TX_CANDIDATE,
      candidateCount: 0,
      resolutionReason: "empty_trace",
      rawTraceBaselineEventCount: rawTraceBaseline?.rawTraceBaselineEventCount ?? null,
      currentHopTraceRawBaselineCount: rawTraceBaseline?.rawTraceBaselineEventCount ?? null,
      currentHopTraceRawCandidateCount: 0,
      currentHopTraceResolvedEventCount: 0,
    });
  }

  const ringAtEnd = trace[trace.length - 1]?.traceRingInstanceId ?? null;
  if (
    rawTraceBaseline?.rawTraceBaselineRingInstanceId &&
    ringAtEnd &&
    rawTraceBaseline.rawTraceBaselineRingInstanceId !== ringAtEnd
  ) {
    // Ring changed mid-session — recover by captureStartMono window only.
  }

  const navChain = parseNavInputChain(navInputEvents, captureStartMono);
  if (!navChain.router) {
    return attachSoftNav({
      transactionId: null,
      reason: TRACE_BELONGS_REASON.ROUTER_NAV_CHAIN_MISSING,
      candidateCount: 0,
      resolutionReason: "no_router_nav_called_shuffle",
      navChain,
      rawTraceBaselineEventCount: rawTraceBaseline?.rawTraceBaselineEventCount ?? null,
      currentHopTraceRawBaselineCount: rawTraceBaseline?.rawTraceBaselineEventCount ?? null,
      currentHopTraceRawCandidateCount: 0,
      currentHopTraceResolvedEventCount: 0,
    });
  }

  const routerMono = navChain.router.monoMs;
  const pointerMono = pointerdownMono > 0 ? pointerdownMono : navChain.pointerdown?.monoMs ?? routerMono;
  const rawCandidateTrace =
    rawTraceBaseline?.rawTraceBaselineEventCount != null &&
    rawTraceBaseline.rawTraceBaselineRingInstanceId &&
    ringAtEnd &&
    rawTraceBaseline.rawTraceBaselineRingInstanceId === ringAtEnd
      ? trace.slice(rawTraceBaseline.rawTraceBaselineEventCount)
      : trace.filter((entry) => inHopWindow(entry, captureStartMono, upperBound));

  const windowed = trace.filter((entry) => inHopWindow(entry, captureStartMono, upperBound));
  const candidateIds = new Set();
  for (const entry of windowed) {
    if (
      entry.kind === "TRANSITION_BEGIN" ||
      entry.kind === "TRANSACTION_REF_ASSIGNED" ||
      entry.kind === "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT" ||
      entry.kind === "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT"
    ) {
      const tid = entryTransactionId(entry);
      if (tid) candidateIds.add(tid);
    }
  }

  // Reinit may split rings: stitch candidates that share txId across rehydration diagnostics.
  for (const entry of windowed) {
    if (
      entry.kind === "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT" ||
      entry.kind === "MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH"
    ) {
      const tid = entryTransactionId(entry) || entry.txId;
      if (tid) candidateIds.add(tid);
    }
  }

  const scored = [];
  for (const transactionId of candidateIds) {
    const candidate = scoreTransactionCandidate(trace, transactionId, routerMono, sourceTab, pointerMono);
    if (candidate) scored.push(candidate);
  }

  if (scored.length === 0) {
    return attachSoftNav({
      transactionId: null,
      reason: TRACE_BELONGS_REASON.NO_CURRENT_HOP_TX_CANDIDATE,
      candidateCount: 0,
      resolutionReason: "no_valid_tx_candidate",
      routerMono,
      rawTraceBaselineEventCount: rawTraceBaseline?.rawTraceBaselineEventCount ?? null,
      currentHopTraceRawBaselineCount: rawTraceBaseline?.rawTraceBaselineEventCount ?? null,
      currentHopTraceRawCandidateCount: rawCandidateTrace.length,
      currentHopTraceResolvedEventCount: 0,
    });
  }

  scored.sort((a, b) => b.score - a.score || b.beginMono - a.beginMono);
  const best = scored[0];
  const slidingCandidates = scored.filter((candidate) => candidate.hasSliding);
  const reinitPresent = windowed.some(
    (entry) =>
      entry.kind === "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT" ||
      entry.kind === "MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH",
  );
  if (reinitPresent && slidingCandidates.length > 1) {
    return {
      transactionId: null,
      reason: TRACE_BELONGS_REASON.AMBIGUOUS_CURRENT_HOP_TRANSACTION,
      candidateCount: slidingCandidates.length,
      resolutionReason: "multiple_sliding_tx_after_reinit",
      routerMono,
      rawTraceBaselineEventCount: rawTraceBaseline?.rawTraceBaselineEventCount ?? null,
      currentHopTraceRawBaselineCount: rawTraceBaseline?.rawTraceBaselineEventCount ?? null,
      currentHopTraceRawCandidateCount: rawCandidateTrace.length,
      currentHopTraceResolvedEventCount: 0,
    };
  }
  const tied = scored.filter((candidate) => candidate.score === best.score);
  if (tied.length > 1) {
    return {
      transactionId: null,
      reason: TRACE_BELONGS_REASON.AMBIGUOUS_CURRENT_HOP_TRANSACTION,
      candidateCount: tied.length,
      resolutionReason: `ambiguous_top_score_${best.score}`,
      candidates: tied.map((candidate) => candidate.transactionId),
      routerMono,
      rawTraceBaselineEventCount: rawTraceBaseline?.rawTraceBaselineEventCount ?? null,
      currentHopTraceRawBaselineCount: rawTraceBaseline?.rawTraceBaselineEventCount ?? null,
      currentHopTraceRawCandidateCount: rawCandidateTrace.length,
      currentHopTraceResolvedEventCount: 0,
    };
  }

  return attachSoftNav({
    transactionId: best.transactionId,
    reason: TRACE_BELONGS_REASON.CURRENT_HOP_TX_RESOLVED,
    candidateCount: scored.length,
    resolutionReason: `tx_score_${best.score}_router_delta_${routerMono - best.beginMono}`,
    routerMono,
    transitionBeginMono: best.beginMono,
    rawTraceBaselineEventCount: rawTraceBaseline?.rawTraceBaselineEventCount ?? null,
    currentHopTraceRawBaselineCount: rawTraceBaseline?.rawTraceBaselineEventCount ?? null,
    currentHopTraceRawCandidateCount: rawCandidateTrace.length,
    currentHopTraceResolvedEventCount: null,
  });
}

function sliceEndIndex(trace, beginIdx) {
  let endIdx = trace.length;
  let sawSettled = false;
  for (let i = beginIdx + 1; i < trace.length; i += 1) {
    const kind = trace[i].kind;
    if (kind === "TRANSITION_BEGIN") {
      endIdx = i;
      break;
    }
    if (kind === "ABORTED") {
      endIdx = i + 1;
      break;
    }
    if (kind === "SETTLED") {
      sawSettled = true;
      continue;
    }
    if (sawSettled && kind === "POST_SETTLE_ROUTE_BRIDGE_COMPLETED") {
      endIdx = i + 1;
      break;
    }
    if (!sawSettled && kind === "TRANSACTION_CLEANUP_COMPLETED") {
      endIdx = i + 1;
      break;
    }
  }
  return endIdx;
}

function isCorrelatedControlEvent(entry, captureStartMono, upperBound, sourceTab) {
  if (!inHopWindow(entry, captureStartMono, upperBound)) return false;
  if (!CONTROL_EVENT_KINDS.has(entry.kind)) return false;
  if (sourceTab && entry.detail && !String(entry.detail).includes(`/${sourceTab}`)) {
    if (entry.kind === "ROUTER_NAV_CALLED") {
      return String(entry.detail).includes("/shuffle");
    }
    return matchesSourceTab(entry, sourceTab);
  }
  return true;
}

export function sliceTraceByTransactionId(trace, transactionId, options = {}) {
  if (!Array.isArray(trace) || !transactionId) return [];

  const captureStartMono = options.captureStartMono ?? 0;
  const upperBound = resolveUpperBound(options.captureEndMono, options.nextHopCaptureStartMono);
  const sourceTab = options.sourceTab ?? null;

  const beginIdx = trace.findIndex(
    (entry) =>
      entry.kind === "TRANSITION_BEGIN" &&
      entryTransactionId(entry) === transactionId &&
      inHopWindow(entry, captureStartMono, upperBound),
  );
  if (beginIdx < 0) return [];

  const endIdx = sliceEndIndex(trace, beginIdx);
  const included = new Set();
  const out = [];

  for (let i = beginIdx; i < endIdx; i += 1) {
    included.add(i);
    out.push(trace[i]);
  }

  for (let i = 0; i < trace.length; i += 1) {
    if (included.has(i)) continue;
    const entry = trace[i];
    if (!inHopWindow(entry, captureStartMono, upperBound)) continue;
    if (entryTransactionId(entry) === transactionId) {
      out.push(entry);
      included.add(i);
      continue;
    }
    if (isCorrelatedControlEvent(entry, captureStartMono, upperBound, sourceTab)) {
      out.push(entry);
      included.add(i);
    }
  }

  out.sort((a, b) => (a.monoMs ?? 0) - (b.monoMs ?? 0));
  return out;
}

export function resolveCurrentHopTrace(trace, options = {}) {
  const resolution = resolveCurrentHopTransaction(trace, options);
  if (!resolution.transactionId) {
    return {
      hopTrace: [],
      resolution: {
        ...resolution,
        currentHopTraceResolvedEventCount: 0,
      },
    };
  }

  let hopTrace = sliceTraceByTransactionId(trace, resolution.transactionId, options);
  if (
    hopTrace.length === 0 &&
    resolution.softNavAware?.mergedTrace?.length
  ) {
    hopTrace = resolution.softNavAware.mergedTrace.filter(
      (entry) =>
        entry.transactionId === resolution.transactionId ||
        entry.txId === resolution.transactionId ||
        !entry.transactionId,
    );
  }
  return {
    hopTrace,
    resolution: {
      ...resolution,
      currentHopTraceResolvedEventCount: hopTrace.length,
    },
  };
}

/** @deprecated Use resolveCurrentHopTrace — kept for callers expecting an array. */
export function sliceTraceForHop(trace, options = {}) {
  return resolveCurrentHopTrace(trace, options).hopTrace;
}

export function traceBelongsToCurrentHop(hopTrace, options = {}) {
  const trace = options.trace ?? hopTrace;
  const resolution =
    options.resolution ??
    resolveCurrentHopTransaction(trace, {
      captureStartMono: options.captureStartMono ?? 0,
      captureEndMono: options.captureEndMono ?? null,
      nextHopCaptureStartMono: options.nextHopCaptureStartMono ?? null,
      sourceTab: options.sourceTab ?? null,
      navInputEvents: options.navInputEvents ?? [],
      pointerdownMono: options.pointerdownMono ?? 0,
      rawTraceBaseline: options.rawTraceBaseline ?? null,
    });

  if (resolution.reason === TRACE_BELONGS_REASON.AMBIGUOUS_CURRENT_HOP_TRANSACTION) {
    return { belongs: false, reason: resolution.reason, resolution };
  }
  if (resolution.reason === TRACE_BELONGS_REASON.ROUTER_NAV_CHAIN_MISSING) {
    return { belongs: false, reason: resolution.reason, resolution };
  }
  if (resolution.reason === TRACE_BELONGS_REASON.NO_CURRENT_HOP_TX_CANDIDATE) {
    return { belongs: false, reason: resolution.reason, resolution };
  }
  if (!resolution.transactionId) {
    return { belongs: false, reason: resolution.reason, resolution };
  }

  const begin = hopTrace.find((entry) => entry.kind === "TRANSITION_BEGIN");
  if (!begin) {
    return { belongs: false, reason: TRACE_BELONGS_REASON.NO_CURRENT_HOP_TX_CANDIDATE, resolution };
  }

  const navChain = parseNavInputChain(
    options.navInputEvents ?? [],
    options.captureStartMono ?? 0,
  );
  if (!navChain.router) {
    return { belongs: false, reason: TRACE_BELONGS_REASON.ROUTER_NAV_CHAIN_MISSING, resolution };
  }
  if (options.sourceTab && !matchesSourceTab(begin, options.sourceTab, resolution.transactionId)) {
    return { belongs: false, reason: TRACE_BELONGS_REASON.SOURCE_PATH_MISMATCH, resolution };
  }

  return { belongs: true, reason: TRACE_BELONGS_REASON.CURRENT_HOP_TX_RESOLVED, resolution };
}

function isNear(value, target, epsilon = 4) {
  return value != null && Math.abs(value - target) <= epsilon;
}

export function detectPhysicalTransform(transformSamples, pointerdownMono, captureStartMono = 0) {
  const lowerBound = captureStartMono > 0 ? captureStartMono : Math.max(0, pointerdownMono);
  const samples = (transformSamples ?? [])
    .map(normalizeTransformSample)
    .filter(
      (sample) =>
        sample &&
        sample.monoMs != null &&
        sample.monoMs >= lowerBound &&
        sample.slideDatasetValue === "running" &&
        sample.sourceX != null &&
        sample.destinationX != null,
    );
  if (samples.length < 2) return false;

  const first = samples[0];
  const last = samples[samples.length - 1];
  const initialSourceX = first.sourceX;
  const initialDestinationX = first.destinationX;
  const finalSourceX = last.sourceX;
  const finalDestinationX = last.destinationX;

  const movingSamples = samples.filter((sample) => {
    const differsFromInitial =
      !isNear(sample.sourceX, initialSourceX) || !isNear(sample.destinationX, initialDestinationX);
    const differsFromFinal =
      !isNear(sample.sourceX, finalSourceX) || !isNear(sample.destinationX, finalDestinationX);
    return differsFromInitial && differsFromFinal;
  });
  if (movingSamples.length < 2) return false;

  const sourceDelta = finalSourceX - initialSourceX;
  const destinationDelta = finalDestinationX - initialDestinationX;
  if (Math.abs(sourceDelta) < 8 && Math.abs(destinationDelta) < 8) return false;

  const expectedSourceDirection = Math.sign(sourceDelta || destinationDelta || 1);
  const expectedDestinationDirection = Math.sign(destinationDelta || sourceDelta || -1);
  let coherentSteps = 0;
  for (let i = 1; i < movingSamples.length; i += 1) {
    const prev = movingSamples[i - 1];
    const curr = movingSamples[i];
    const sourceStep = curr.sourceX - prev.sourceX;
    const destinationStep = curr.destinationX - prev.destinationX;
    const sourceOk =
      Math.abs(sourceStep) <= 1 ||
      Math.sign(sourceStep) === expectedSourceDirection ||
      Math.sign(sourceStep) === 0;
    const destinationOk =
      Math.abs(destinationStep) <= 1 ||
      Math.sign(destinationStep) === expectedDestinationDirection ||
      Math.sign(destinationStep) === 0;
    if (sourceOk && destinationOk) coherentSteps += 1;
  }
  return coherentSteps >= 1;
}

export function classifyMultisourceSlide(input) {
  const {
    trace = [],
    slideMutations = [],
    transformSamples = [],
    screencastSawRunning = false,
    controlledSlideFrameCount = 0,
    loadingActuallyVisible = false,
    loadingShellVisibleFrameCount = 0,
    bugWindowFrameCount = 0,
    blackRootFrameCount = 0,
    presentedNoneFrameCount = 0,
    pointerdownMono = 0,
    captureStartMono = 0,
    captureEndMono = null,
    nextHopCaptureStartMono = null,
    sourceTab = null,
    navInputEvents = [],
    rawTraceBaseline = null,
    softNavDiag = null,
    traceArchive = null,
    pinDiag = null,
    runtimeLifecycle = null,
    pinDiagCaptured = null,
  } = input;

  const resolvedNavInputEvents = syntheticNavChainIfMissing(
    navInputEvents,
    pointerdownMono,
    captureStartMono,
    sourceTab,
  );

  const traceOptions = {
    pointerdownMono,
    captureStartMono,
    captureEndMono,
    nextHopCaptureStartMono,
    sourceTab,
    navInputEvents: resolvedNavInputEvents,
    rawTraceBaseline,
    softNavDiag,
    traceArchive,
    pinDiag,
    runtimeLifecycle,
    pinDiagCaptured,
  };

  const { hopTrace, resolution } = resolveCurrentHopTrace(trace, traceOptions);

  const traceBelongResult = traceBelongsToCurrentHop(hopTrace, {
    ...traceOptions,
    trace,
    resolution,
  });

  const TRACE_BELONGS_TO_CURRENT_HOP = traceBelongResult.belongs;

  const ENGINE_SLIDE_OCCURRED = hopTrace.some((entry) => entry.kind === "PHASE_SLIDING");
  const domLowerBound = captureStartMono > 0 ? captureStartMono : pointerdownMono;
  const DOM_SLIDE_OCCURRED = slideMutations.some(
    (mutation) => mutation?.value === "running" && (mutation.monoMs ?? 0) >= domLowerBound,
  );
  const PHYSICAL_TRANSFORM_OCCURRED = detectPhysicalTransform(
    transformSamples,
    pointerdownMono,
    captureStartMono,
  );
  const SCREENCAST_SLIDE_OBSERVED =
    controlledSlideFrameCount > 0 || Boolean(screencastSawRunning);

  let classification = CLASSIFICATION.OTHER_PROVEN_CAUSE;

  if (loadingActuallyVisible || loadingShellVisibleFrameCount > 0) {
    classification = CLASSIFICATION.FAIL_LOADING_VISIBLE;
  } else if (bugWindowFrameCount > 0) {
    classification = CLASSIFICATION.FAIL_BUG_WINDOW;
  } else if (blackRootFrameCount > 0) {
    classification = CLASSIFICATION.FAIL_BLACK_ROOT;
  } else if (presentedNoneFrameCount > 0) {
    classification = CLASSIFICATION.FAIL_PRESENTED_NONE;
  } else if (!ENGINE_SLIDE_OCCURRED) {
    classification = CLASSIFICATION.ENGINE_DID_NOT_SLIDE;
  } else if (!DOM_SLIDE_OCCURRED) {
    classification = CLASSIFICATION.DOM_STAGE_MARKER_DIVERGENCE;
  } else if (!PHYSICAL_TRANSFORM_OCCURRED) {
    classification = CLASSIFICATION.TRANSFORM_NOT_ANIMATED;
  } else if (
    ENGINE_SLIDE_OCCURRED &&
    DOM_SLIDE_OCCURRED &&
    PHYSICAL_TRANSFORM_OCCURRED &&
    !SCREENCAST_SLIDE_OBSERVED
  ) {
    classification = CLASSIFICATION.CAPTURE_MISSED_SHORT_SLIDE;
  } else if (ENGINE_SLIDE_OCCURRED && DOM_SLIDE_OCCURRED && PHYSICAL_TRANSFORM_OCCURRED) {
    classification = SCREENCAST_SLIDE_OBSERVED
      ? CLASSIFICATION.SLIDE_CONFIRMED_ALL_SOURCES
      : CLASSIFICATION.CAPTURE_MISSED_SHORT_SLIDE;
  }

  const slideOccurredForRelease =
    ENGINE_SLIDE_OCCURRED && DOM_SLIDE_OCCURRED && PHYSICAL_TRANSFORM_OCCURRED;

  return {
    ENGINE_SLIDE_OCCURRED,
    DOM_SLIDE_OCCURRED,
    PHYSICAL_TRANSFORM_OCCURRED,
    SCREENCAST_SLIDE_OBSERVED,
    TRACE_BELONGS_TO_CURRENT_HOP,
    traceBelongsReason: traceBelongResult.reason,
    classification,
    slideOccurredForRelease,
    hopTrace,
    hardFail: HARD_FAIL_CLASSIFICATIONS.has(classification),
    currentHopTransactionIdResolved: resolution.transactionId,
    currentHopTransactionResolutionReason: resolution.resolutionReason,
    currentHopTransactionCandidateCount: resolution.candidateCount,
    currentHopTraceRawBaselineCount: resolution.currentHopTraceRawBaselineCount,
    currentHopTraceRawCandidateCount: resolution.currentHopTraceRawCandidateCount,
    currentHopTraceResolvedEventCount: resolution.currentHopTraceResolvedEventCount,
  };
}

export function buildSlideTimingMetrics({ trace = [], transformSamples = [], pointerdownMono = 0 } = {}) {
  const hopTrace = Array.isArray(trace) ? trace : [];
  const findKind = (kind) => hopTrace.find((entry) => entry.kind === kind) ?? null;
  const begin = findKind("TRANSITION_BEGIN");
  const sliding = findKind("PHASE_SLIDING");
  const transitionEnd = findKind("TRANSITION_END");
  const settled = findKind("SETTLED");

  const normalized = (transformSamples ?? [])
    .map(normalizeTransformSample)
    .filter((sample) => sample?.monoMs != null);

  const movingTransforms = normalized.filter((sample) => {
    if (sample.slideDatasetValue !== "running") return false;
    if (sample.sourceX == null || sample.destinationX == null) return false;
    const identity =
      Math.abs(sample.sourceX) <= 1 &&
      Math.abs(sample.destinationX) <= 1;
    return !identity;
  });

  const firstMovingTransform = movingTransforms[0] ?? null;
  const lastMovingTransform = movingTransforms[movingTransforms.length - 1] ?? null;

  const transactionPreparationMs =
    begin?.monoMs != null && sliding?.monoMs != null ? sliding.monoMs - begin.monoMs : null;
  const engineSlideWindowMs =
    sliding?.monoMs != null && transitionEnd?.monoMs != null
      ? transitionEnd.monoMs - sliding.monoMs
      : null;
  const physicalTransformWindowMs =
    firstMovingTransform?.monoMs != null && lastMovingTransform?.monoMs != null
      ? lastMovingTransform.monoMs - firstMovingTransform.monoMs
      : null;
  const transitionEndSchedulingLagMs =
    transitionEnd?.monoMs != null && lastMovingTransform?.monoMs != null
      ? transitionEnd.monoMs - lastMovingTransform.monoMs
      : null;

  return {
    pointerdownMono,
    transitionBeginMono: begin?.monoMs ?? null,
    phaseSlidingMono: sliding?.monoMs ?? null,
    transitionEndMono: transitionEnd?.monoMs ?? null,
    settledMono: settled?.monoMs ?? null,
    firstMovingTransformMono: firstMovingTransform?.monoMs ?? null,
    lastMovingTransformMono: lastMovingTransform?.monoMs ?? null,
    transactionPreparationMs,
    engineSlideWindowMs,
    physicalTransformWindowMs,
    transitionEndSchedulingLagMs,
    slidePhysicalWindowMs: engineSlideWindowMs,
  };
}

export function releaseHopCleanWithMultisource({
  baseChecks,
  multisource,
  postDestTail = 20,
  requireBridge = false,
  minimalPhysicalDiag = false,
  nativeLifecycleNoScreencast = false,
  waapiCompositorLifecycle = false,
  minimalEvidenceLevel = null,
  absoluteExtras = {},
  hop = null,
  externalIntermediateFrameCount = null,
  nativeTransitionLifecycle = null,
  minimalReleaseFields = null,
  noScreencastPhysicalEvidenceValid = false,
}) {
  const waapiFromTrace = hopUsesWaapiCompositorMotor(multisource?.hopTrace || []);
  const physical = resolveReleasePhysicalEvidence({
    minimalPhysicalDiag,
    nativeLifecycleNoScreencast:
      nativeLifecycleNoScreencast && !waapiCompositorLifecycle && !waapiFromTrace,
    waapiCompositorLifecycle: waapiCompositorLifecycle || waapiFromTrace,
    minimalEvidenceLevel,
    legacyPhysicalTransformOccurred: Boolean(multisource?.PHYSICAL_TRANSFORM_OCCURRED),
    legacyClassification: multisource?.classification ?? null,
    hop,
    externalIntermediateFrameCount,
    nativeTransitionLifecycle,
    noScreencastPhysicalEvidenceValid,
  });

  // Legacy mode: slideOccurredForRelease requires in-page physical samples.
  // Minimal mode: RELEASE_PHYSICAL_EVIDENCE_VALID from external/native evidence.
  // No-screencast: native lifecycle TE evidence only.
  const usingMinimalProvider =
    physical.PHYSICAL_EVIDENCE_PROVIDER_SELECTED ===
    PHYSICAL_EVIDENCE_PROVIDER.MINIMAL_EXTERNAL_NATIVE;
  const usingWaapiProvider =
    physical.PHYSICAL_EVIDENCE_PROVIDER_SELECTED ===
      PHYSICAL_EVIDENCE_PROVIDER.WAAPI_COMPOSITOR_LIFECYCLE_NO_SCREENCAST ||
    hopUsesWaapiCompositorMotor(multisource?.hopTrace || []);
  const usingNoScreencastProvider =
    physical.PHYSICAL_EVIDENCE_PROVIDER_SELECTED ===
      PHYSICAL_EVIDENCE_PROVIDER.NATIVE_TRANSITION_LIFECYCLE_NO_SCREENCAST ||
    usingWaapiProvider;

  const slideOccurred = usingNoScreencastProvider
    ? physical.RELEASE_PHYSICAL_EVIDENCE_VALID &&
      Boolean(multisource?.ENGINE_SLIDE_OCCURRED) &&
      Boolean(multisource?.DOM_SLIDE_OCCURRED)
    : usingMinimalProvider
      ? physical.RELEASE_PHYSICAL_EVIDENCE_VALID &&
        Boolean(multisource?.ENGINE_SLIDE_OCCURRED) &&
        Boolean(multisource?.DOM_SLIDE_OCCURRED)
      : Boolean(multisource?.slideOccurredForRelease);

  const slideValid = usingNoScreencastProvider
    ? Boolean(baseChecks.MICRO_SLIDE_LIFECYCLE_VALID) && slideOccurred
    : baseChecks.COMPLETE_HOP_CAPTURE &&
      baseChecks.MICRO_SLIDE_LIFECYCLE_VALID &&
      slideOccurred;

  const visualSafety = absoluteSafetyGatesPass(baseChecks, {
    ...absoluteExtras,
    loadingActuallyVisibleDuringBridge:
      absoluteExtras.loadingActuallyVisibleDuringBridge ??
      multisource?.loadingActuallyVisibleDuringBridge,
    bridgeOwnerNotPresentableCount:
      absoluteExtras.bridgeOwnerNotPresentableCount ??
      multisource?.bridgeOwnerNotPresentableCount,
    ownerNoneCriticalCount:
      absoluteExtras.ownerNoneCriticalCount ?? multisource?.ownerNoneCriticalCount,
    bugWindowCount: absoluteExtras.bugWindowCount ?? multisource?.bugWindowCount,
    blackRootCount: absoluteExtras.blackRootCount ?? multisource?.blackRootCount,
    realPresentedNoneCriticalCount:
      absoluteExtras.realPresentedNoneCriticalCount ??
      multisource?.realPresentedNoneCriticalCount,
    visibleRouteMismatchCount:
      absoluteExtras.visibleRouteMismatchCount ?? multisource?.visibleRouteMismatchCount,
    watchdogPreemptExpectedNativeEndFromStartCount:
      absoluteExtras.watchdogPreemptExpectedNativeEndFromStartCount ??
      multisource?.watchdogPreemptExpectedNativeEndFromStartCount,
    watchdogPreemptWithinSlackFromStartCount:
      absoluteExtras.watchdogPreemptWithinSlackFromStartCount ??
      multisource?.watchdogPreemptWithinSlackFromStartCount,
    watchdogCausedTransitionCancelCount:
      absoluteExtras.watchdogCausedTransitionCancelCount ??
      multisource?.watchdogCausedTransitionCancelCount,
  });

  const bridgeValid =
    !requireBridge ||
    (baseChecks.postSettleBridgeLifecycleValid === true &&
      (baseChecks.bridgeOwnerNotPresentableFrameCount ?? 0) === 0 &&
      baseChecks.BRIDGE_OWNER_SURFACE_PRESENTABLE !== false);

  // In minimal / no-screencast mode, legacy TRANSFORM_NOT_ANIMATED hardFail is superseded
  // when the active provider has valid physical evidence.
  const hardFailBlocks = physical.legacyTransformSuperseded
    ? Boolean(multisource?.hardFail) &&
      multisource?.classification !== "TRANSFORM_NOT_ANIMATED"
    : Boolean(multisource?.hardFail);

  let releaseHopClean =
    slideValid &&
    visualSafety &&
    bridgeValid &&
    (usingNoScreencastProvider || baseChecks.FIRST_VISUAL_CHANGE_FROM_SOURCE) &&
    (usingNoScreencastProvider || baseChecks.FIRST_POST_SLIDE_SURFACE) &&
    (usingNoScreencastProvider || baseChecks.tailFramesAfterSecondValid >= postDestTail) &&
    !hardFailBlocks &&
    physical.RELEASE_PHYSICAL_EVIDENCE_VALID;

  // When explicit FASE-5 fields are supplied, they are authoritative for
  // minimal and native-lifecycle-no-screencast providers.
  if ((usingMinimalProvider || usingNoScreencastProvider) && minimalReleaseFields) {
    releaseHopClean = releaseHopCleanMinimalFormula({
      ...minimalReleaseFields,
      RELEASE_PHYSICAL_EVIDENCE_VALID: physical.RELEASE_PHYSICAL_EVIDENCE_VALID,
      ENGINE_SLIDE_OCCURRED: Boolean(multisource?.ENGINE_SLIDE_OCCURRED),
      DOM_SLIDE_OCCURRED: Boolean(multisource?.DOM_SLIDE_OCCURRED),
    });
  }

  let nativeStartGate = null;
  if (usingNoScreencastProvider) {
    if (usingWaapiProvider) {
      const waapiEv = evaluateWaapiCompositorPhysicalEvidence({
        engineSlideOccurred: Boolean(multisource?.ENGINE_SLIDE_OCCURRED),
        domSlideOccurred: Boolean(multisource?.DOM_SLIDE_OCCURRED),
        hopTrace: multisource?.hopTrace || [],
        settleReason: absoluteExtras.settleReason || null,
        bridgeCompleted: Boolean(minimalReleaseFields?.bridgeCompleted),
        pinCleared: Boolean(
          minimalReleaseFields?.latchReleasedFinalRouteReady ||
            absoluteExtras.pinCleared ||
            false,
        ),
      });
      nativeStartGate = {
        provider: PHYSICAL_EVIDENCE_PROVIDER_WAAPI_COMPOSITOR,
        physicalNativeTransitionRequired: false,
        physicalNativeTransitionSatisfied: null,
        physicalWaapiCompositorRequired: true,
        physicalWaapiCompositorSatisfied: waapiEv.PHYSICAL_WAAPI_COMPOSITOR_SATISFIED,
        CSS_TRANSITION_PROVIDER_NOT_USED_IN_WAAPI_MODE: true,
        primaryFailureClass: waapiEv.primaryFailureClass,
        WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_SATISFIED:
          waapiEv.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_SATISFIED,
        statuses: WAAPI_PRIMARY_STATUS,
      };
      if (physical.RELEASE_PHYSICAL_EVIDENCE_VALID !== true) {
        releaseHopClean = false;
      }
      if (waapiEv.PHYSICAL_WAAPI_COMPOSITOR_SATISFIED !== true) {
        releaseHopClean = false;
      }
    } else {
      nativeStartGate = evaluateNativeTransitionStartGate({
        provider: PHYSICAL_EVIDENCE_PROVIDER.NATIVE_TRANSITION_LIFECYCLE_NO_SCREENCAST,
        hopTrace: multisource?.hopTrace || [],
        transitionEvents: absoluteExtras.transitionEvents || [],
        nativeLifecycleSummary: absoluteExtras.nativeLifecycleSummary || null,
        engineSlideOccurred: Boolean(multisource?.ENGINE_SLIDE_OCCURRED),
        domSlideOccurred: Boolean(multisource?.DOM_SLIDE_OCCURRED),
        currentHopEvaluationStatus: absoluteExtras.currentHopEvaluationStatus || null,
        bridgeCompleted: Boolean(minimalReleaseFields?.bridgeCompleted),
        pinCleared: Boolean(
          minimalReleaseFields?.latchReleasedFinalRouteReady ||
            absoluteExtras.pinCleared ||
            false,
        ),
        commitMode: absoluteExtras.commitMode || null,
        phaseArmed: absoluteExtras.phaseArmed ?? null,
        phaseSliding: absoluteExtras.phaseSliding ?? null,
        noScreencastPhysicalEvidenceValid: physical.RELEASE_PHYSICAL_EVIDENCE_VALID,
        finalWriteOverrides: absoluteExtras.finalWriteOverrides || {},
      });
      // Logical settle / FULL_TX / bridge / pin never override missing native lifecycle.
      // Authoritative NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID is required for clean.
      if (physical.RELEASE_PHYSICAL_EVIDENCE_VALID !== true) {
        releaseHopClean = false;
      }
      if (nativeStartGate.physicalNativeTransitionSatisfied !== true) {
        releaseHopClean = false;
      }
    }
  }

  return {
    releaseHopClean,
    physicalEvidence: physical,
    nativeStartGate,
  };
}

/** Back-compat boolean wrapper used by older harness call sites. */
export function releaseHopCleanWithMultisourceBool(args) {
  const result = releaseHopCleanWithMultisource(args);
  return typeof result === "boolean" ? result : Boolean(result.releaseHopClean);
}

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}
