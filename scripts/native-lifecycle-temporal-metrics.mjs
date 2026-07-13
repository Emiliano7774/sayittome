/**
 * Temporal distribution metrics for NATIVE_TRANSITION_LIFECYCLE_NO_SCREENCAST series.
 */
import { percentile } from "./shuffle-slide-multisource-classifier.mjs";

function mono(trace, kind) {
  return trace.find((e) => e.kind === kind)?.monoMs ?? null;
}

function chosenStartMono(trace, summary) {
  return (
    trace.find((e) => e.kind === "SLIDE_TRANSITION_START_ANCHOR_COMMITTED")
      ?.slideTransitionStartedMono ??
    summary?.chosenStartMono ??
    null
  );
}

export function extractHopTemporalMetrics(hop) {
  const trace = hop.hopTraceForHop || hop.hopNineEvidence?.hopTrace || [];
  const minimal = hop.hopNineDiag?.minimalPhysical ?? null;
  const transform = (minimal?.transitionEvents ?? []).filter((e) => e.propertyName === "transform");
  const run = transform.find((e) => e.type === "transitionrun");
  const start = transform.find((e) => e.type === "transitionstart");
  const end = transform.find((e) => e.type === "transitionend");
  const starts = transform.filter((e) => e.type === "transitionstart");
  const sourceStart = starts.find((e) => e.nodeRole === "source");
  const destStart = starts.find((e) => e.nodeRole === "destination");

  const startMono = chosenStartMono(trace, hop.nativeLifecycleSummary);
  const finalWriteMono = mono(trace, "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL");
  const finalWriteCbMono = mono(trace, "SLIDE_FINAL_WRITE_RAF_CALLBACK_ENTERED");
  const settleMono =
    trace.find((e) => e.kind === "SETTLE_INITIATED")?.monoMs ??
    trace.find((e) => e.kind === "SETTLED")?.monoMs ??
    null;
  const teMono = end?.monoMs ?? hop.nativeLifecycleSummary?.transitionendMono ?? null;

  return {
    hopNum: hop.hopNum,
    sourceTab: hop.sourceTab,
    runMinusStart:
      run?.monoMs != null && startMono != null ? run.monoMs - startMono : null,
    startMinusFinalWrite:
      start?.monoMs != null && finalWriteMono != null ? start.monoMs - finalWriteMono : null,
    teMinusStart: teMono != null && startMono != null ? teMono - startMono : null,
    teElapsedTime: end?.elapsedTime ?? hop.nativeLifecycleSummary?.transitionendElapsedTime ?? null,
    finalWriteCbDelay:
      finalWriteCbMono != null && finalWriteMono != null
        ? finalWriteCbMono - finalWriteMono
        : null,
    startSkew:
      sourceStart?.monoMs != null && destStart?.monoMs != null
        ? destStart.monoMs - sourceStart.monoMs
        : null,
    settleMinusStart:
      settleMono != null && startMono != null ? settleMono - startMono : null,
  };
}

function distStats(values) {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) {
    return { raw: [], min: null, p50: null, p95: null, max: null, monotonic: true };
  }
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  return {
    raw: sorted,
    min,
    p50,
    p95,
    max,
    monotonic: min <= p50 && p50 <= p95 && p95 <= max,
  };
}

export function summarizeNativeLifecycleSeries(hops) {
  const perHop = hops.map(extractHopTemporalMetrics);
  const pick = (key) => perHop.map((h) => h[key]);

  let traceInvalid = 0;
  let txUnresolved = 0;
  let engineFalse = 0;
  let domFalse = 0;
  let finalInlineMissing = 0;

  for (const hop of hops) {
    const ev = hop.hopNineEvidence ?? {};
    const trace = hop.hopTraceForHop || [];
    if (ev.TRACE_BELONGS_TO_CURRENT_HOP !== true) traceInvalid += 1;
    if (!ev.currentHopTransactionIdResolved) txUnresolved += 1;
    if (ev.ENGINE_SLIDE_OCCURRED !== true) engineFalse += 1;
    if (ev.DOM_SLIDE_OCCURRED !== true) domFalse += 1;
    if (!trace.some((e) => e.kind === "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL")) {
      finalInlineMissing += 1;
    }
  }

  return {
    perHop,
    runMinusStart: distStats(pick("runMinusStart")),
    startMinusFinalWrite: distStats(pick("startMinusFinalWrite")),
    teMinusStart: distStats(pick("teMinusStart")),
    teElapsedTime: distStats(pick("teElapsedTime")),
    finalWriteCbDelay: distStats(pick("finalWriteCbDelay")),
    startSkew: distStats(pick("startSkew")),
    settleMinusStart: distStats(pick("settleMinusStart")),
    gateCounts: {
      traceCurrentHopInvalid: traceInvalid,
      txUnresolved,
      engineFalse,
      domFalse,
      finalInlineMissing,
    },
  };
}

export function summarizeSourceSpecificCounts(hops) {
  const sources = ["chats", "stories", "boost", "settings"];
  const table = {};
  for (const source of sources) {
    const subset = hops.filter((h) => h.sourceTab === source);
    const row = {
      attempted: subset.length,
      clean: subset.filter((h) => h.RELEASE_HOP_CLEAN).length,
      transitionrun: 0,
      transitionstart: 0,
      transitionend: 0,
      transitioncancel: 0,
      settleTransitionend: 0,
      settleWatchdog: 0,
      watchdogCallback: 0,
      bridgeOwnerInvalid: 0,
      loadingReal: 0,
      loadingShell: 0,
      ownerNoneCritical: 0,
      bugWindow: 0,
      routeMismatch: 0,
    };
    for (const h of subset) {
      const ns = h.nativeLifecycleSummary || {};
      row.transitionrun += ns.transitionrunCount || 0;
      row.transitionstart += ns.transitionstartCount || 0;
      row.transitionend += ns.transitionendCount || 0;
      row.transitioncancel += ns.transitioncancelCount || 0;
      if (ns.settleReason === "transitionend") row.settleTransitionend += 1;
      row.settleWatchdog += ns.watchdogSettleCount || 0;
      row.watchdogCallback += ns.watchdogCallbackCount || 0;
      row.bridgeOwnerInvalid += h.bridgeAudit?.bridgeOwnerNotPresentableFrameCount || 0;
      row.loadingReal += h.bridgeAudit?.loadingActuallyVisibleDuringBridge || 0;
      row.loadingShell += h.loadingShellVisibleFrameCount || 0;
      row.bugWindow += h.bugWindowFrameCount || 0;
    }
    table[source] = row;
  }
  return table;
}

export function evaluateNativeNoScreencastSeriesClean(hops, expectedCount = 20) {
  if (hops.length !== expectedCount) return false;
  return hops.every(
    (h) =>
      h.RELEASE_HOP_CLEAN === true &&
      h.NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID === true &&
      h.CAPTURE_TOOLING_CLEAN === true &&
      (h.nativeLifecycleSummary?.transitioncancelCount ?? 0) === 0 &&
      (h.nativeLifecycleSummary?.watchdogSettleCount ?? 0) === 0,
  );
}
