/**
 * Inert DOM write forensics for main-tab → shuffle slide transforms.
 * Active only when navcapture / main-tab shuffle trace diagnostics are enabled.
 * Does not change motor behavior — emits trace events around existing writes.
 */

import { getMainTabShufflePresentationRuntimeInstanceId } from "@/lib/navigation/mainTabShufflePresentationRuntime";
import {
  enrichLifecycleDiagEntry,
  getTransitionModuleInstanceId,
  observeHostElement,
  observeStageElement,
  type LifecycleDiagPayload,
} from "@/lib/perf/mainTabShuffleLifecycleDiag";
import { getDiagnosticFrameId } from "@/lib/perf/mainTabShuffleDiagFrameId";
import {
  isMainTabShuffleTraceDiagEnabled,
  persistMainTabShuffleTraceEntry,
} from "@/lib/perf/mainTabToShuffleTraceDiag";

export type SlideDomNodeRole = "source" | "destination" | "host" | "html" | "other";

export type InlineStyleSnapshot = {
  inlineTransform: string | null;
  inlineTransition: string | null;
  inlineTransitionProperty: string | null;
  inlineTransitionDuration: string | null;
  inlineTransitionTimingFunction: string | null;
  className: string | null;
  isConnected: boolean | null;
};

export type SlideDomWriteBase = {
  writerId: string;
  caller: string;
  transactionId?: string | null;
  phase?: string;
  navSeq?: number;
  nodeRole: SlideDomNodeRole;
  nodeInstanceId?: string | null;
  property: string;
  intendedValue?: string | null;
  datasetSlideState?: string | null;
  stageInstanceId?: string | null;
  shuffleHostInstanceId?: string | null;
};

function monoMs() {
  if (typeof performance === "undefined") return 0;
  return Math.round(performance.timeOrigin + performance.now());
}

function pathnameNow() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.split("?")[0].split("#")[0];
}

function datasetSlideStateNow() {
  if (typeof document === "undefined") return null;
  return document.documentElement.getAttribute("data-main-tab-shuffle-slide");
}

function readInlineSnapshot(el: Element | null | undefined): InlineStyleSnapshot | null {
  if (!el || !(el instanceof HTMLElement)) return null;
  return {
    inlineTransform: el.style.transform || null,
    inlineTransition: el.style.transition || null,
    inlineTransitionProperty: el.style.transitionProperty || null,
    inlineTransitionDuration: el.style.transitionDuration || null,
    inlineTransitionTimingFunction: el.style.transitionTimingFunction || null,
    className: el.className || null,
    isConnected: el.isConnected,
  };
}

function baseFields(input: SlideDomWriteBase): Omit<LifecycleDiagPayload, "kind"> {
  const shuffleHost = typeof document !== "undefined"
    ? document.getElementById("sayittome-shuffle-keepalive-host")
    : null;
  const stageEl = typeof document !== "undefined"
    ? document.querySelector("[data-main-tab-shuffle-stage]")
    : null;
  return {
    monoMs: monoMs(),
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.phase ?? "idle",
    transactionId: input.transactionId ?? null,
    writerId: input.writerId,
    caller: input.caller,
    nodeRole: input.nodeRole,
    nodeInstanceId: input.nodeInstanceId ?? null,
    property: input.property,
    intendedValue: input.intendedValue ?? null,
    datasetSlideState: input.datasetSlideState ?? datasetSlideStateNow(),
    stageInstanceId: input.stageInstanceId ?? observeStageElement(stageEl),
    shuffleHostInstanceId: input.shuffleHostInstanceId ?? observeHostElement(shuffleHost),
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
  };
}

function emit(kind: string, payload: Omit<LifecycleDiagPayload, "kind">) {
  if (!isMainTabShuffleTraceDiagEnabled()) return;
  persistMainTabShuffleTraceEntry(
    enrichLifecycleDiagEntry({
      kind,
      diagnosticFrameId: getDiagnosticFrameId(),
      ...payload,
    }),
  );
}

export function isSlideDomWriteDiagEnabled() {
  return isMainTabShuffleTraceDiagEnabled();
}

export function readSlideDomInlineSnapshot(el: Element | null | undefined) {
  return readInlineSnapshot(el);
}

export function emitSlideDomWriteIntent(input: SlideDomWriteBase) {
  emit("SLIDE_DOM_WRITE_INTENT", baseFields(input));
}

export function emitSlideDomWriteCommitted(
  input: SlideDomWriteBase,
  el: Element | null | undefined,
  before?: InlineStyleSnapshot | null,
) {
  const snap = readInlineSnapshot(el);
  emit("SLIDE_DOM_WRITE_COMMITTED", {
    ...baseFields(input),
    inlineTransform: snap?.inlineTransform ?? null,
    inlineTransition: snap?.inlineTransition ?? null,
    inlineTransitionProperty: snap?.inlineTransitionProperty ?? null,
    inlineTransitionDuration: snap?.inlineTransitionDuration ?? null,
    inlineTransitionTimingFunction: snap?.inlineTransitionTimingFunction ?? null,
    className: snap?.className ?? null,
    isConnected: snap?.isConnected ?? null,
    beforeInlineTransform: before?.inlineTransform ?? null,
    beforeInlineTransition: before?.inlineTransition ?? null,
  });
}

/** Run a DOM write with intent/committed forensics — does not alter the write itself. */
export function traceSlideDomWrite<T extends Element | null | undefined>(
  input: SlideDomWriteBase,
  el: T,
  apply: (target: NonNullable<T> & HTMLElement) => void,
): void {
  if (!el || !(el instanceof HTMLElement)) return;
  const before = readInlineSnapshot(el);
  emitSlideDomWriteIntent(input);
  apply(el);
  emitSlideDomWriteCommitted(input, el, before);
}

export function emitSlideFinalTransformsWriteAttempt(input: {
  transactionId?: string | null;
  phase?: string;
  navSeq?: number;
  sourceNodeId?: string | null;
  destinationNodeId?: string | null;
  sourceBeforeInlineTransform?: string | null;
  destinationBeforeInlineTransform?: string | null;
  sourceTargetTransform?: string | null;
  destinationTargetTransform?: string | null;
  sourceInlineTransition?: string | null;
  destinationInlineTransition?: string | null;
  datasetSlideState?: string | null;
  stageInstanceId?: string | null;
  hostInstanceId?: string | null;
  skipped?: boolean;
  skipReason?: string | null;
  rafPhaseCheck?: string | null;
}) {
  emit("SLIDE_FINAL_TRANSFORMS_WRITE_ATTEMPT", {
    monoMs: monoMs(),
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.phase ?? "idle",
    transactionId: input.transactionId ?? null,
    sourceNodeId: input.sourceNodeId ?? null,
    destinationNodeId: input.destinationNodeId ?? null,
    sourceBeforeInlineTransform: input.sourceBeforeInlineTransform ?? null,
    destinationBeforeInlineTransform: input.destinationBeforeInlineTransform ?? null,
    sourceTargetTransform: input.sourceTargetTransform ?? null,
    destinationTargetTransform: input.destinationTargetTransform ?? null,
    sourceInlineTransition: input.sourceInlineTransition ?? null,
    destinationInlineTransition: input.destinationInlineTransition ?? null,
    datasetSlideState: input.datasetSlideState ?? datasetSlideStateNow(),
    stageInstanceId: input.stageInstanceId ?? null,
    hostInstanceId: input.hostInstanceId ?? null,
    skipped: input.skipped ?? false,
    skipReason: input.skipReason ?? null,
    rafPhaseCheck: input.rafPhaseCheck ?? null,
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
  });
}

export function emitSlideFinalTransformsWriteReturned(input: {
  transactionId?: string | null;
  phase?: string;
  navSeq?: number;
  sourceNodeId?: string | null;
  destinationNodeId?: string | null;
  sourceAfterInlineTransform?: string | null;
  destinationAfterInlineTransform?: string | null;
  sourceAfterInlineTransition?: string | null;
  destinationAfterInlineTransition?: string | null;
  sourceIsConnected?: boolean | null;
  destinationIsConnected?: boolean | null;
  datasetSlideState?: string | null;
}) {
  emit("SLIDE_FINAL_TRANSFORMS_WRITE_RETURNED", {
    monoMs: monoMs(),
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.phase ?? "idle",
    transactionId: input.transactionId ?? null,
    sourceNodeId: input.sourceNodeId ?? null,
    destinationNodeId: input.destinationNodeId ?? null,
    sourceAfterInlineTransform: input.sourceAfterInlineTransform ?? null,
    destinationAfterInlineTransform: input.destinationAfterInlineTransform ?? null,
    sourceAfterInlineTransition: input.sourceAfterInlineTransition ?? null,
    destinationAfterInlineTransition: input.destinationAfterInlineTransition ?? null,
    sourceIsConnected: input.sourceIsConnected ?? null,
    destinationIsConnected: input.destinationIsConnected ?? null,
    datasetSlideState: input.datasetSlideState ?? datasetSlideStateNow(),
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
  });
}

export function emitStageEffectLifecycle(input: {
  kind: "STAGE_EFFECT_ENTER" | "STAGE_EFFECT_APPLY_PHASE_STATE" | "STAGE_EFFECT_CLEANUP";
  transactionId?: string | null;
  phaseProp?: string;
  canonicalPhase?: string;
  datasetSlideStateBefore?: string | null;
  writerId?: string | null;
  hostInstanceId?: string | null;
  stageInstanceId?: string | null;
  navSeq?: number;
}) {
  emit(input.kind, {
    monoMs: monoMs(),
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.canonicalPhase ?? input.phaseProp ?? "idle",
    transactionId: input.transactionId ?? null,
    phaseProp: input.phaseProp ?? null,
    canonicalPhase: input.canonicalPhase ?? null,
    datasetSlideStateBefore: input.datasetSlideStateBefore ?? null,
    writerId: input.writerId ?? null,
    hostInstanceId: input.hostInstanceId ?? null,
    stageInstanceId: input.stageInstanceId ?? null,
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
  });
}

export function emitSlideFinalWriteRafScheduled(input: {
  transactionId?: string | null;
  phase?: string;
  navSeq?: number;
  scheduledMonoMs: number;
  sourceNodeId?: string | null;
  destinationNodeId?: string | null;
  stageInstanceId?: string | null;
  hostInstanceId?: string | null;
  datasetSlideState?: string | null;
  documentVisibilityState?: string | null;
  documentHasFocus?: boolean | null;
  slideStartMono?: number | null;
  slideFailsafeExpectedFireMono?: number | null;
}) {
  emit("SLIDE_FINAL_WRITE_RAF_SCHEDULED", {
    monoMs: input.scheduledMonoMs,
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.phase ?? "idle",
    transactionId: input.transactionId ?? null,
    sourceNodeId: input.sourceNodeId ?? null,
    destinationNodeId: input.destinationNodeId ?? null,
    datasetSlideState: input.datasetSlideState ?? datasetSlideStateNow(),
    stageInstanceId: input.stageInstanceId ?? null,
    hostInstanceId: input.hostInstanceId ?? null,
    scheduledMonoMs: input.scheduledMonoMs,
    documentVisibilityState: input.documentVisibilityState ?? null,
    documentHasFocus: input.documentHasFocus ?? null,
    slideStartMono: input.slideStartMono ?? null,
    slideFailsafeExpectedFireMono: input.slideFailsafeExpectedFireMono ?? null,
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
  });
}

export function emitSlideFinalWriteRafCallbackEntered(input: {
  transactionId?: string | null;
  scheduledTransactionId?: string | null;
  scheduledMonoMs: number;
  rafCallbackTimestamp: number;
  scheduledPhase?: string | null;
  currentPhase?: string | null;
  navSeq?: number;
  sourceNodeId?: string | null;
  destinationNodeId?: string | null;
  sourceIsConnected?: boolean | null;
  destinationIsConnected?: boolean | null;
  stageInstanceId?: string | null;
  hostInstanceId?: string | null;
  datasetSlideState?: string | null;
  documentVisibilityState?: string | null;
  documentHasFocus?: boolean | null;
  finalWriteRafSequence?: string | null;
  nativeRafHandleFromClosure?: number | null;
  currentStoredRafHandle?: number | null;
  currentStoredRafSequence?: string | null;
  scheduledModuleInstanceId?: string | null;
  currentModuleInstanceId?: string | null;
  scheduledStageInstanceId?: string | null;
  currentStageInstanceId?: string | null;
  scheduledSourceNodeId?: string | null;
  scheduledDestinationNodeId?: string | null;
  currentSourceNodeId?: string | null;
  currentDestinationNodeId?: string | null;
  performanceNow?: number | null;
  performanceTimeOrigin?: number | null;
  browserRealmInstanceId?: string | null;
  documentInstanceId?: string | null;
}) {
  const callbackMono = monoMs();
  emit("SLIDE_FINAL_WRITE_RAF_CALLBACK_ENTERED", {
    monoMs: callbackMono,
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.currentPhase ?? "idle",
    transactionId: input.transactionId ?? null,
    scheduledTransactionId: input.scheduledTransactionId ?? null,
    currentTxId: input.transactionId ?? null,
    scheduledPhase: input.scheduledPhase ?? null,
    currentPhase: input.currentPhase ?? null,
    sourceNodeId: input.sourceNodeId ?? null,
    destinationNodeId: input.destinationNodeId ?? null,
    sourceIsConnected: input.sourceIsConnected ?? null,
    destinationIsConnected: input.destinationIsConnected ?? null,
    datasetSlideState: input.datasetSlideState ?? datasetSlideStateNow(),
    stageInstanceId: input.stageInstanceId ?? null,
    hostInstanceId: input.hostInstanceId ?? null,
    scheduledMonoMs: input.scheduledMonoMs,
    rafCallbackTimestamp: input.rafCallbackTimestamp,
    scheduleToCallbackMs: callbackMono - input.scheduledMonoMs,
    finalWriteRafSequence: input.finalWriteRafSequence ?? null,
    nativeRafHandleFromClosure: input.nativeRafHandleFromClosure ?? null,
    currentStoredRafHandle: input.currentStoredRafHandle ?? null,
    currentStoredRafSequence: input.currentStoredRafSequence ?? null,
    scheduledModuleInstanceId: input.scheduledModuleInstanceId ?? null,
    currentModuleInstanceId: input.currentModuleInstanceId ?? null,
    scheduledStageInstanceId: input.scheduledStageInstanceId ?? null,
    currentStageInstanceId: input.currentStageInstanceId ?? null,
    scheduledSourceNodeId: input.scheduledSourceNodeId ?? null,
    scheduledDestinationNodeId: input.scheduledDestinationNodeId ?? null,
    currentSourceNodeId: input.currentSourceNodeId ?? null,
    currentDestinationNodeId: input.currentDestinationNodeId ?? null,
    performanceNow: input.performanceNow ?? null,
    performanceTimeOrigin: input.performanceTimeOrigin ?? null,
    browserRealmInstanceId: input.browserRealmInstanceId ?? null,
    documentInstanceId: input.documentInstanceId ?? null,
    documentVisibilityState: input.documentVisibilityState ?? null,
    documentHasFocus: input.documentHasFocus ?? null,
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
  });
}

export function emitSlideDomAttributeMutation(input: {
  nodeRole: SlideDomNodeRole;
  nodeInstanceId?: string | null;
  attributeName: string;
  oldValue: string | null;
  newValue: string | null;
  transactionId?: string | null;
  phase?: string;
  datasetSlideState?: string | null;
  navSeq?: number;
}) {
  emit("SLIDE_DOM_ATTRIBUTE_MUTATION", {
    monoMs: monoMs(),
    navSeq: input.navSeq ?? 0,
    pathname: pathnameNow(),
    phase: input.phase ?? "idle",
    transactionId: input.transactionId ?? null,
    nodeRole: input.nodeRole,
    nodeInstanceId: input.nodeInstanceId ?? null,
    attributeName: input.attributeName,
    oldValue: input.oldValue,
    newValue: input.newValue,
    datasetSlideState: input.datasetSlideState ?? datasetSlideStateNow(),
    moduleInstanceId: getTransitionModuleInstanceId() ?? undefined,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
  });
}
