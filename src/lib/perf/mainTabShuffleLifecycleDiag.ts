/**
 * Inert lifecycle diagnostics for main-tab → shuffle transition forensics.
 * Active only when navcapture / main-tab shuffle trace diagnostics are enabled.
 */

import {
  ensureTraceRingIdentity,
  getTraceRingIdentity,
  isMainTabShuffleTraceDiagEnabled,
  persistMainTabShuffleTraceEntry,
  type MainTabShuffleDiagTraceEvent,
} from "@/lib/perf/mainTabToShuffleTraceDiag";
import { installDiagnosticFrameIdBridge } from "@/lib/perf/mainTabShuffleDiagFrameId";
import { installRafIdentityDiagBridge } from "@/lib/perf/mainTabShuffleRafIdentityDiag";
import { isShuffleDestinationWarmIntentActive } from "@/lib/shuffle/shuffleWarmHopIntent";

export type LifecycleDiagPayload = Partial<MainTabShuffleDiagTraceEvent> & {
  kind: string;
  monoMs?: number;
  navSeq?: number;
  pathname?: string;
  phase?: string;
  transactionId?: string | null;
  caller?: string;
  reason?: string;
  timerId?: string | null;
  scheduledTransactionId?: string | null;
  currentTransactionId?: string | null;
  currentPhase?: string | null;
  expectedFireMono?: number | null;
  moduleInstanceId?: string;
  moduleCreatedMono?: number;
  traceRingInstanceId?: string;
  traceRingCreatedMono?: number;
  shuffleHostInstanceId?: string | null;
  stageInstanceId?: string | null;
  sourceSurfaceInstanceId?: string | null;
  destinationSurfaceInstanceId?: string | null;
  slideFailsafeTimerId?: string | null;
  hostInstanceId?: string | null;
  eventTargetHostInstanceId?: string | null;
  propertyName?: string | null;
  elapsedTime?: number | null;
  previousPathname?: string | null;
  nextPathname?: string | null;
  presentationLatchNavSeq?: number | null;
  presentationLatchActive?: boolean;
  postSettleBridgeActive?: boolean;
  warmIntentActive?: boolean;
  shouldBlockLegacyShufflePresentation?: boolean;
  blockReason?: string | null;
  runtimeInstanceId?: string;
  bridgeGeneration?: number;
  previousBridgeObserverOwnerModuleId?: string | null;
  writerId?: string | null;
  nodeRole?: string | null;
  nodeInstanceId?: string | null;
  property?: string | null;
  intendedValue?: string | null;
  inlineTransform?: string | null;
  inlineTransition?: string | null;
  inlineTransitionProperty?: string | null;
  inlineTransitionDuration?: string | null;
  inlineTransitionTimingFunction?: string | null;
  className?: string | null;
  isConnected?: boolean | null;
  beforeInlineTransform?: string | null;
  beforeInlineTransition?: string | null;
  sourceNodeId?: string | null;
  destinationNodeId?: string | null;
  sourceBeforeInlineTransform?: string | null;
  destinationBeforeInlineTransform?: string | null;
  sourceTargetTransform?: string | null;
  destinationTargetTransform?: string | null;
  sourceInlineTransition?: string | null;
  destinationInlineTransition?: string | null;
  sourceAfterInlineTransform?: string | null;
  destinationAfterInlineTransform?: string | null;
  sourceAfterInlineTransition?: string | null;
  destinationAfterInlineTransition?: string | null;
  sourceIsConnected?: boolean | null;
  destinationIsConnected?: boolean | null;
  skipped?: boolean;
  skipReason?: string | null;
  rafPhaseCheck?: string | null;
  phaseProp?: string | null;
  canonicalPhase?: string | null;
  datasetSlideStateBefore?: string | null;
  datasetSlideState?: string | null;
  attributeName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  diagnosticFrameId?: number | null;
  scheduledMonoMs?: number | null;
  rafCallbackTimestamp?: number | null;
  scheduleToCallbackMs?: number | null;
  scheduledPhase?: string | null;
  currentTxId?: string | null;
  documentVisibilityState?: string | null;
  documentHasFocus?: boolean | null;
  slideStartMono?: number | null;
  slideFailsafeExpectedFireMono?: number | null;
  presentedShuffleHostNodeId?: string | null;
  settleCaller?: string | null;
  settleReason?: string | null;
  slideDurationMs?: number | null;
  slackMs?: number | null;
  slideFinalWriteCommittedMono?: number | null;
  sourceTransitionStartedMono?: number | null;
  destinationTransitionStartedMono?: number | null;
  slideTransitionStartedMono?: number | null;
  performanceNow?: number | null;
  performanceTimeOrigin?: number | null;
  browserRealmInstanceId?: string | null;
  documentInstanceId?: string | null;
  finalWriteRafSequence?: string | null;
  nativeRafHandle?: number | null;
  nativeRafHandleFromClosure?: number | null;
  currentStoredRafHandle?: number | null;
  currentStoredRafSequence?: string | null;
  existingStoredRafHandle?: number | null;
  existingStoredRafSequence?: string | null;
  scheduledModuleInstanceId?: string | null;
  currentModuleInstanceId?: string | null;
  scheduledStageInstanceId?: string | null;
  currentStageInstanceId?: string | null;
  scheduledSourceNodeId?: string | null;
  scheduledDestinationNodeId?: string | null;
  currentSourceNodeId?: string | null;
  currentDestinationNodeId?: string | null;
  callSequence?: number | null;
  fieldName?: string | null;
  probeFrameSequence?: number | null;
};

let transitionModuleInstanceId: string | null = null;
let transitionModuleCreatedMono: number | null = null;
let transactionIdCounter = 0;
let slideFailsafeTimerCounter = 0;
let hostInstanceCounter = 0;
let stageInstanceCounter = 0;

let lastObservedShuffleHostId: string | null = null;
let lastObservedPathname: string | null = null;
let pathnameObserverInstalled = false;

const hostInstanceMap = new WeakMap<object, string>();
const stageInstanceMap = new WeakMap<object, string>();

function monoMs() {
  if (typeof performance === "undefined") return 0;
  return Math.round(performance.timeOrigin + performance.now());
}

function pathnameNow() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.split("?")[0].split("#")[0];
}

export function isMainTabShuffleLifecycleDiagEnabled(): boolean {
  return isMainTabShuffleTraceDiagEnabled();
}

export function getTransitionModuleInstanceId(): string | null {
  return transitionModuleInstanceId;
}

export function getTransitionModuleCreatedMono(): number | null {
  return transitionModuleCreatedMono;
}

export function bootstrapTransitionModuleLifecycleDiag(
  moduleInstanceId: string,
  moduleCreatedMono: number,
) {
  transitionModuleInstanceId = moduleInstanceId;
  transitionModuleCreatedMono = moduleCreatedMono;
  if (!isMainTabShuffleLifecycleDiagEnabled() || typeof window === "undefined") return;

  installDiagnosticFrameIdBridge();
  installRafIdentityDiagBridge();
  ensureTraceRingIdentity();
  emitLifecycleDiag({
    kind: "TRANSITION_MODULE_INSTANCE_CREATED",
    monoMs: moduleCreatedMono,
    pathname: pathnameNow(),
    moduleInstanceId,
    moduleCreatedMono,
  });
}

export function nextCanonicalTransactionId(navSeq: number, sourcePath: string) {
  transactionIdCounter += 1;
  return `tx-${navSeq}-${transactionIdCounter}-${sourcePath.replace(/\//g, "_") || "root"}`;
}

export function nextSlideFailsafeTimerId() {
  slideFailsafeTimerCounter += 1;
  return `slide-fs-${slideFailsafeTimerCounter}`;
}

export function observeHostElement(el: Element | null | undefined): string | null {
  if (!el) return null;
  let id = hostInstanceMap.get(el);
  if (!id) {
    hostInstanceCounter += 1;
    id = `shuffle-host-${hostInstanceCounter}`;
    hostInstanceMap.set(el, id);
  }
  return id;
}

export function observeStageElement(el: Element | null | undefined): string | null {
  if (!el) return null;
  let id = stageInstanceMap.get(el);
  if (!id) {
    stageInstanceCounter += 1;
    id = `stage-${stageInstanceCounter}`;
    stageInstanceMap.set(el, id);
  }
  return id;
}

export function noteShuffleHostObserved(host: Element | null, context: string) {
  if (!isMainTabShuffleLifecycleDiagEnabled()) return null;
  const hostId = observeHostElement(host);
  if (!hostId) return null;

  emitLifecycleDiag({
    kind: "SHUFFLE_HOST_INSTANCE_OBSERVED",
    note: context,
    shuffleHostInstanceId: hostId,
    hostInstanceId: hostId,
  });

  if (lastObservedShuffleHostId && lastObservedShuffleHostId !== hostId) {
    emitLifecycleDiag({
      kind: "SHUFFLE_HOST_INSTANCE_CHANGED",
      note: `${lastObservedShuffleHostId}->${hostId}|${context}`,
      shuffleHostInstanceId: hostId,
      hostInstanceId: hostId,
    });
  }
  lastObservedShuffleHostId = hostId;
  return hostId;
}

export function enrichLifecycleDiagEntry(
  entry: Partial<LifecycleDiagPayload>,
): MainTabShuffleDiagTraceEvent {
  const ring = getTraceRingIdentity();
  return {
    monoMs: entry.monoMs ?? monoMs(),
    navSeq: entry.navSeq ?? 0,
    pathname: entry.pathname ?? pathnameNow(),
    phase: entry.phase ?? "idle",
    ...entry,
    transitionModuleInstanceId: transitionModuleInstanceId ?? undefined,
    transitionModuleCreatedMono: transitionModuleCreatedMono ?? undefined,
    traceRingInstanceId: ring?.traceRingInstanceId,
    traceRingCreatedMono: ring?.traceRingCreatedMono,
  } as MainTabShuffleDiagTraceEvent;
}

export function emitLifecycleDiag(payload: LifecycleDiagPayload) {
  if (!isMainTabShuffleLifecycleDiagEnabled()) return;
  ensureTraceRingIdentity();
  const entry = enrichLifecycleDiagEntry({
    warmIntentActive: isShuffleDestinationWarmIntentActive(),
    ...payload,
  });
  persistMainTabShuffleTraceEntry(entry);
}

export function emitTransactionRefAssigned(
  transactionId: string,
  navSeq: number,
  sourcePath: string,
  createdMono: number,
  phase: string,
) {
  emitLifecycleDiag({
    kind: "TRANSACTION_REF_ASSIGNED",
    transactionId,
    navSeq,
    phase,
    note: `sourcePath=${sourcePath}|createdMono=${createdMono}`,
  });
}

export function emitTransactionRefCleared(
  transactionId: string,
  phase: string,
  caller: string,
  reason: string,
  navSeq: number,
) {
  emitLifecycleDiag({
    kind: "TRANSACTION_REF_CLEARED",
    transactionId,
    phase,
    caller,
    reason,
    navSeq,
  });
}

export function emitSlideFailsafeScheduled(input: {
  timerId: string;
  expectedFireMono: number;
  transactionId: string;
  phase: string;
  navSeq: number;
}) {
  emitLifecycleDiag({
    kind: "SLIDE_FAILSAFE_SCHEDULED",
    timerId: input.timerId,
    slideFailsafeTimerId: input.timerId,
    expectedFireMono: input.expectedFireMono,
    transactionId: input.transactionId,
    phase: input.phase,
    navSeq: input.navSeq,
  });
}

export function emitSlideFailsafeCleared(input: {
  timerId: string | null;
  transactionId: string | null;
  caller: string;
  reason: string;
  phase: string;
  navSeq: number;
}) {
  emitLifecycleDiag({
    kind: "SLIDE_FAILSAFE_CLEARED",
    timerId: input.timerId,
    slideFailsafeTimerId: input.timerId,
    transactionId: input.transactionId,
    caller: input.reason ? input.caller : input.caller,
    reason: input.reason,
    phase: input.phase,
    navSeq: input.navSeq,
  });
}

export function emitSlideFailsafeCallbackEntered(input: {
  timerId: string;
  scheduledTransactionId: string | null;
  currentTransactionId: string | null;
  currentPhase: string | null;
  navSeq: number;
}) {
  emitLifecycleDiag({
    kind: "SLIDE_FAILSAFE_CALLBACK_ENTERED",
    timerId: input.timerId,
    slideFailsafeTimerId: input.timerId,
    scheduledTransactionId: input.scheduledTransactionId,
    currentTransactionId: input.currentTransactionId,
    currentPhase: input.currentPhase,
    transactionId: input.currentTransactionId,
    phase: input.currentPhase ?? "idle",
    navSeq: input.navSeq,
  });
}

export function emitSettleInitiated(input: {
  caller: string;
  reason: string;
  transactionId?: string | null;
  phase?: string;
  navSeq?: number;
  timerId?: string | null;
}) {
  emitLifecycleDiag({
    kind: "SETTLE_INITIATED",
    settleCaller: input.caller,
    settleReason: input.reason,
    caller: input.caller,
    reason: input.reason,
    transactionId: input.transactionId ?? null,
    phase: input.phase ?? "idle",
    navSeq: input.navSeq ?? 0,
    timerId: input.timerId ?? null,
    slideFailsafeTimerId: input.timerId ?? null,
  });
}

export function emitTransitionListenerAttached(input: {
  hostInstanceId: string | null;
  transactionId: string;
  propertyName: string;
  navSeq: number;
  phase: string;
}) {
  emitLifecycleDiag({
    kind: "TRANSITION_LISTENER_ATTACHED",
    hostInstanceId: input.hostInstanceId,
    shuffleHostInstanceId: input.hostInstanceId,
    transactionId: input.transactionId,
    propertyName: input.propertyName,
    navSeq: input.navSeq,
    phase: input.phase,
  });
}

export function emitTransitionListenerRemoved(input: {
  hostInstanceId: string | null;
  transactionId: string | null;
  caller: string;
  reason: string;
  navSeq: number;
  phase: string;
}) {
  emitLifecycleDiag({
    kind: "TRANSITION_LISTENER_REMOVED",
    hostInstanceId: input.hostInstanceId,
    shuffleHostInstanceId: input.hostInstanceId,
    transactionId: input.transactionId,
    caller: input.caller,
    reason: input.reason,
    navSeq: input.navSeq,
    phase: input.phase,
  });
}

export function emitTransitionEndReceived(input: {
  hostInstanceId: string | null;
  eventTargetHostInstanceId: string | null;
  propertyName: string;
  elapsedTime: number | null;
  transactionId: string | null;
  phase: string;
  navSeq: number;
}) {
  emitLifecycleDiag({
    kind: "TRANSITION_END_RECEIVED",
    hostInstanceId: input.hostInstanceId,
    eventTargetHostInstanceId: input.eventTargetHostInstanceId,
    propertyName: input.propertyName,
    elapsedTime: input.elapsedTime,
    transactionId: input.transactionId,
    phase: input.phase,
    navSeq: input.navSeq,
  });
}

export function emitRoutePathnameObservedChanged(input: {
  previousPathname: string;
  nextPathname: string;
  transactionId: string | null;
  phase: string;
  navSeq: number;
  shuffleHostInstanceId?: string | null;
  stageInstanceId?: string | null;
  sourceSurfaceInstanceId?: string | null;
  destinationSurfaceInstanceId?: string | null;
  slideFailsafeTimerId?: string | null;
  presentationLatchActive?: boolean;
  presentationLatchNavSeq?: number | null;
  postSettleBridgeActive?: boolean;
}) {
  emitLifecycleDiag({
    kind: "ROUTE_PATHNAME_OBSERVED_CHANGED",
    previousPathname: input.previousPathname,
    nextPathname: input.nextPathname,
    transactionId: input.transactionId,
    phase: input.phase,
    navSeq: input.navSeq,
    shuffleHostInstanceId: input.shuffleHostInstanceId ?? null,
    stageInstanceId: input.stageInstanceId ?? null,
    sourceSurfaceInstanceId: input.sourceSurfaceInstanceId ?? null,
    destinationSurfaceInstanceId: input.destinationSurfaceInstanceId ?? null,
    slideFailsafeTimerId: input.slideFailsafeTimerId ?? null,
    presentationLatchActive: input.presentationLatchActive,
    presentationLatchNavSeq: input.presentationLatchNavSeq ?? null,
    postSettleBridgeActive: input.postSettleBridgeActive,
    warmIntentActive: isShuffleDestinationWarmIntentActive(),
  });
}

export function observeRoutePathnameChange(input: {
  nextPathname: string;
  transactionId: string | null;
  phase: string;
  navSeq: number;
  shuffleHostInstanceId?: string | null;
  stageInstanceId?: string | null;
  sourceSurfaceInstanceId?: string | null;
  destinationSurfaceInstanceId?: string | null;
  slideFailsafeTimerId?: string | null;
  presentationLatchActive?: boolean;
  presentationLatchNavSeq?: number | null;
  postSettleBridgeActive?: boolean;
}) {
  if (!isMainTabShuffleLifecycleDiagEnabled()) return;
  const prev = lastObservedPathname ?? input.nextPathname;
  if (prev === input.nextPathname && lastObservedPathname !== null) return;
  emitRoutePathnameObservedChanged({
    previousPathname: prev,
    nextPathname: input.nextPathname,
    transactionId: input.transactionId,
    phase: input.phase,
    navSeq: input.navSeq,
    shuffleHostInstanceId: input.shuffleHostInstanceId,
    stageInstanceId: input.stageInstanceId,
    sourceSurfaceInstanceId: input.sourceSurfaceInstanceId,
    destinationSurfaceInstanceId: input.destinationSurfaceInstanceId,
    slideFailsafeTimerId: input.slideFailsafeTimerId,
    presentationLatchActive: input.presentationLatchActive,
    presentationLatchNavSeq: input.presentationLatchNavSeq,
    postSettleBridgeActive: input.postSettleBridgeActive,
  });
  lastObservedPathname = input.nextPathname;
}

export function installPathnameLifecycleObserver(
  readSnapshot: () => {
    transactionId: string | null;
    phase: string;
    navSeq: number;
    shuffleHostInstanceId?: string | null;
    stageInstanceId?: string | null;
    sourceSurfaceInstanceId?: string | null;
    destinationSurfaceInstanceId?: string | null;
    slideFailsafeTimerId?: string | null;
    presentationLatchActive?: boolean;
    presentationLatchNavSeq?: number | null;
    postSettleBridgeActive?: boolean;
  },
) {
  if (!isMainTabShuffleLifecycleDiagEnabled() || typeof window === "undefined") return;
  if (pathnameObserverInstalled) return;
  pathnameObserverInstalled = true;
  lastObservedPathname = pathnameNow();

  const origPushState = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);

  const notify = () => {
    const snap = readSnapshot();
    observeRoutePathnameChange({
      nextPathname: pathnameNow(),
      ...snap,
    });
  };

  history.pushState = function pushStateDiag(...args: Parameters<History["pushState"]>) {
    origPushState(...args);
    notify();
  };
  history.replaceState = function replaceStateDiag(...args: Parameters<History["replaceState"]>) {
    origReplaceState(...args);
    notify();
  };
  window.addEventListener("popstate", notify);
}

export function emitLegacyRevealAttempt(input: {
  caller: string;
  pathname: string;
  transactionId: string | null;
  phase: string;
  navSeq: number;
  presentationLatchNavSeq: number | null;
  presentationLatchActive: boolean;
  postSettleBridgeActive: boolean;
  shouldBlockLegacyShufflePresentation: boolean;
  blockReason: string | null;
  shuffleHostInstanceId?: string | null;
  slideFailsafeTimerId?: string | null;
}) {
  emitLifecycleDiag({
    kind: "LEGACY_REVEAL_ATTEMPT",
    note: input.caller,
    pathname: input.pathname,
    transactionId: input.transactionId,
    phase: input.phase,
    navSeq: input.navSeq,
    presentationLatchNavSeq: input.presentationLatchNavSeq,
    presentationLatchActive: input.presentationLatchActive,
    postSettleBridgeActive: input.postSettleBridgeActive,
    shouldBlockLegacyShufflePresentation: input.shouldBlockLegacyShufflePresentation,
    blockReason: input.blockReason,
    shuffleHostInstanceId: input.shuffleHostInstanceId ?? null,
    slideFailsafeTimerId: input.slideFailsafeTimerId ?? null,
  });
}

export function emitLegacyRevealExecuted(input: {
  caller: string;
  pathname: string;
  transactionId: string | null;
  phase: string;
  navSeq: number;
  shuffleHostInstanceId?: string | null;
}) {
  emitLifecycleDiag({
    kind: "LEGACY_REVEAL_EXECUTED",
    note: input.caller,
    pathname: input.pathname,
    transactionId: input.transactionId,
    phase: input.phase,
    navSeq: input.navSeq,
    shuffleHostInstanceId: input.shuffleHostInstanceId ?? null,
  });
}

export function emitLegacyRevealBlocked(input: {
  caller: string;
  pathname: string;
  transactionId: string | null;
  phase: string;
  navSeq: number;
  blockReason: string;
}) {
  emitLifecycleDiag({
    kind: "LEGACY_REVEAL_BLOCKED",
    note: input.caller,
    pathname: input.pathname,
    transactionId: input.transactionId,
    phase: input.phase,
    navSeq: input.navSeq,
    blockReason: input.blockReason,
  });
}
