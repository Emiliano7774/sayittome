/**
 * Diagnostic-only RAF identity helpers for final-write forensics.
 * Does not change motor scheduling, timing, or cancel behavior.
 */

import { getMainTabShufflePresentationRuntimeInstanceId } from "@/lib/navigation/mainTabShufflePresentationRuntime";
import {
  enrichLifecycleDiagEntry,
  getTransitionModuleInstanceId,
  type LifecycleDiagPayload,
} from "@/lib/perf/mainTabShuffleLifecycleDiag";
import { getDiagnosticFrameId } from "@/lib/perf/mainTabShuffleDiagFrameId";
import {
  isMainTabShuffleTraceDiagEnabled,
  persistMainTabShuffleTraceEntry,
} from "@/lib/perf/mainTabToShuffleTraceDiag";

let finalWriteRafSequenceCounter = 0;
let startSlideAnimationCallCounter = 0;
let browserRealmInstanceId: string | null = null;
let documentInstanceId: string | null = null;

/** monoMs = round(performance.timeOrigin + performance.now()) */
export function diagMonoMs() {
  if (typeof performance === "undefined") return 0;
  return Math.round(performance.timeOrigin + performance.now());
}

export function diagPerformanceNow() {
  if (typeof performance === "undefined") return null;
  return performance.now();
}

export function diagPerformanceTimeOrigin() {
  if (typeof performance === "undefined") return null;
  return performance.timeOrigin;
}

export function getBrowserRealmInstanceId(): string | null {
  if (typeof window === "undefined") return null;
  if (!browserRealmInstanceId) {
    browserRealmInstanceId = `realm-${diagMonoMs()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return browserRealmInstanceId;
}

export function getDocumentInstanceId(): string | null {
  if (typeof document === "undefined") return null;
  if (!documentInstanceId) {
    documentInstanceId = `doc-${diagMonoMs()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return documentInstanceId;
}

export function nextFinalWriteRafSequence(): string {
  finalWriteRafSequenceCounter += 1;
  return `fw-raf-${finalWriteRafSequenceCounter}`;
}

export function nextStartSlideAnimationCallSequence(): number {
  startSlideAnimationCallCounter += 1;
  return startSlideAnimationCallCounter;
}

function pathnameNow() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.split("?")[0].split("#")[0];
}

function emit(kind: string, payload: Omit<LifecycleDiagPayload, "kind">) {
  if (!isMainTabShuffleTraceDiagEnabled()) return;
  persistMainTabShuffleTraceEntry(
    enrichLifecycleDiagEntry({
      kind,
      diagnosticFrameId: getDiagnosticFrameId(),
      performanceNow: diagPerformanceNow(),
      performanceTimeOrigin: diagPerformanceTimeOrigin(),
      browserRealmInstanceId: getBrowserRealmInstanceId(),
      documentInstanceId: getDocumentInstanceId(),
      ...payload,
    }),
  );
}

export function emitStartSlideAnimationEntered(input: {
  transactionId?: string | null;
  phase?: string;
  navSeq?: number;
  callSequence: number;
  hostInstanceId?: string | null;
  stageInstanceId?: string | null;
  sourceNodeId?: string | null;
  destinationNodeId?: string | null;
  datasetSlideState?: string | null;
}) {
  emit("START_SLIDE_ANIMATION_ENTERED", {
    monoMs: diagMonoMs(),
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.phase ?? "idle",
    transactionId: input.transactionId ?? null,
    callSequence: input.callSequence,
    hostInstanceId: input.hostInstanceId ?? null,
    stageInstanceId: input.stageInstanceId ?? null,
    sourceNodeId: input.sourceNodeId ?? null,
    destinationNodeId: input.destinationNodeId ?? null,
    datasetSlideState: input.datasetSlideState ?? null,
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
  });
}

export function emitStartSlideAnimationReturned(input: {
  transactionId?: string | null;
  phase?: string;
  navSeq?: number;
  callSequence: number;
  hostInstanceId?: string | null;
  stageInstanceId?: string | null;
  sourceNodeId?: string | null;
  destinationNodeId?: string | null;
  datasetSlideState?: string | null;
}) {
  emit("START_SLIDE_ANIMATION_RETURNED", {
    monoMs: diagMonoMs(),
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.phase ?? "idle",
    transactionId: input.transactionId ?? null,
    callSequence: input.callSequence,
    hostInstanceId: input.hostInstanceId ?? null,
    stageInstanceId: input.stageInstanceId ?? null,
    sourceNodeId: input.sourceNodeId ?? null,
    destinationNodeId: input.destinationNodeId ?? null,
    datasetSlideState: input.datasetSlideState ?? null,
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
  });
}

/** Capture RAF provider identity for diagnostics only — never changes scheduling. */
export function captureRafProviderIdentity() {
  if (typeof window === "undefined") {
    return {
      rafProviderType: null,
      windowIdentityId: null,
      requestAnimationFrameFunctionId: null,
      requestAnimationFrameName: null,
      requestAnimationFrameToStringFingerprint: null,
      requestAnimationFrameIsOwnProperty: null,
      requestAnimationFrameEqualsCapturedNativeRaf: null,
    };
  }
  const w = window as Window & {
    __sayittomeCapturedNativeRaf?: typeof window.requestAnimationFrame;
    __sayittomeWindowIdentityId?: string;
  };
  if (!w.__sayittomeWindowIdentityId) {
    w.__sayittomeWindowIdentityId = `win-${diagMonoMs()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  if (!w.__sayittomeCapturedNativeRaf) {
    try {
      w.__sayittomeCapturedNativeRaf = Window.prototype.requestAnimationFrame;
    } catch {
      w.__sayittomeCapturedNativeRaf = window.requestAnimationFrame;
    }
  }
  const callable = window.requestAnimationFrame;
  const fingerprint = (fn: typeof window.requestAnimationFrame | null) => {
    if (typeof fn !== "function") return null;
    try {
      const src = Function.prototype.toString.call(fn);
      return `${fn.name || "anonymous"}|len=${src.length}|${src.slice(0, 96)}`;
    } catch {
      return `${fn.name || "anonymous"}|unreadable`;
    }
  };
  return {
    rafProviderType: typeof callable,
    windowIdentityId: w.__sayittomeWindowIdentityId,
    requestAnimationFrameFunctionId: fingerprint(callable),
    requestAnimationFrameName: callable?.name ?? null,
    requestAnimationFrameToStringFingerprint: fingerprint(callable),
    requestAnimationFrameIsOwnProperty: Object.prototype.hasOwnProperty.call(
      window,
      "requestAnimationFrame",
    ),
    requestAnimationFrameEqualsCapturedNativeRaf: callable === w.__sayittomeCapturedNativeRaf,
  };
}

export function emitSlideFinalWriteRafScheduleRequested(input: {
  transactionId?: string | null;
  phase?: string;
  navSeq?: number;
  finalWriteRafSequence: string;
  sourceNodeId?: string | null;
  destinationNodeId?: string | null;
  stageInstanceId?: string | null;
  hostInstanceId?: string | null;
  datasetSlideState?: string | null;
  existingStoredRafHandle?: number | null;
  existingStoredRafSequence?: string | null;
  documentVisibilityState?: string | null;
  documentHasFocus?: boolean | null;
}) {
  const rafProvider = captureRafProviderIdentity();
  emit("SLIDE_FINAL_WRITE_RAF_SCHEDULE_REQUESTED", {
    monoMs: diagMonoMs(),
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.phase ?? "idle",
    transactionId: input.transactionId ?? null,
    finalWriteRafSequence: input.finalWriteRafSequence,
    sourceNodeId: input.sourceNodeId ?? null,
    destinationNodeId: input.destinationNodeId ?? null,
    stageInstanceId: input.stageInstanceId ?? null,
    hostInstanceId: input.hostInstanceId ?? null,
    datasetSlideState: input.datasetSlideState ?? null,
    existingStoredRafHandle: input.existingStoredRafHandle ?? null,
    existingStoredRafSequence: input.existingStoredRafSequence ?? null,
    documentVisibilityState: input.documentVisibilityState ?? null,
    documentHasFocus: input.documentHasFocus ?? null,
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
    ...rafProvider,
  });
}

export function emitSlideFinalWriteRafHandleAssigned(input: {
  transactionId?: string | null;
  phase?: string;
  navSeq?: number;
  finalWriteRafSequence: string;
  nativeRafHandle: number;
  sourceNodeId?: string | null;
  destinationNodeId?: string | null;
  stageInstanceId?: string | null;
  hostInstanceId?: string | null;
}) {
  const rafProvider = captureRafProviderIdentity();
  emit("SLIDE_FINAL_WRITE_RAF_HANDLE_ASSIGNED", {
    monoMs: diagMonoMs(),
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.phase ?? "idle",
    transactionId: input.transactionId ?? null,
    finalWriteRafSequence: input.finalWriteRafSequence,
    nativeRafHandle: input.nativeRafHandle,
    sourceNodeId: input.sourceNodeId ?? null,
    destinationNodeId: input.destinationNodeId ?? null,
    stageInstanceId: input.stageInstanceId ?? null,
    hostInstanceId: input.hostInstanceId ?? null,
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
    ...rafProvider,
  });
}

export function emitSlideRafCancelAttempt(input: {
  caller: string;
  reason: string;
  handle: number | null;
  fieldName?: string | null;
  finalWriteRafSequence?: string | null;
  transactionId?: string | null;
  phase?: string;
  navSeq?: number;
  currentStoredRafHandle?: number | null;
  currentStoredRafSequence?: string | null;
}) {
  emit("SLIDE_RAF_CANCEL_ATTEMPT", {
    monoMs: diagMonoMs(),
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.phase ?? "idle",
    transactionId: input.transactionId ?? null,
    caller: input.caller,
    reason: input.reason,
    nativeRafHandle: input.handle,
    fieldName: input.fieldName ?? null,
    finalWriteRafSequence: input.finalWriteRafSequence ?? null,
    currentStoredRafHandle: input.currentStoredRafHandle ?? null,
    currentStoredRafSequence: input.currentStoredRafSequence ?? null,
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
  });
}

export function emitSlideRafCancelReturned(input: {
  caller: string;
  reason: string;
  handle: number | null;
  fieldName?: string | null;
  finalWriteRafSequence?: string | null;
  transactionId?: string | null;
  phase?: string;
  navSeq?: number;
  currentStoredRafHandle?: number | null;
  currentStoredRafSequence?: string | null;
}) {
  emit("SLIDE_RAF_CANCEL_RETURNED", {
    monoMs: diagMonoMs(),
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.phase ?? "idle",
    transactionId: input.transactionId ?? null,
    caller: input.caller,
    reason: input.reason,
    nativeRafHandle: input.handle,
    fieldName: input.fieldName ?? null,
    finalWriteRafSequence: input.finalWriteRafSequence ?? null,
    currentStoredRafHandle: input.currentStoredRafHandle ?? null,
    currentStoredRafSequence: input.currentStoredRafSequence ?? null,
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
  });
}

export function installRafIdentityDiagBridge(): void {
  if (typeof window === "undefined" || !isMainTabShuffleTraceDiagEnabled()) return;
  const w = window as Window & {
    __mainTabShuffleDiagIdentity?: {
      browserRealmInstanceId: () => string | null;
      documentInstanceId: () => string | null;
      performanceTimeOrigin: () => number | null;
    };
  };
  w.__mainTabShuffleDiagIdentity = {
    browserRealmInstanceId: getBrowserRealmInstanceId,
    documentInstanceId: getDocumentInstanceId,
    performanceTimeOrigin: diagPerformanceTimeOrigin,
  };
}
