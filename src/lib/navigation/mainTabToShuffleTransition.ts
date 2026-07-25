import {
  activateShuffleTabSurface,
  clearShuffleEntryHandoffAfterTransitionAbort,
  keepPresentedShuffleSurfaceForRouteBridge,
  releasePresentedShuffleOwnerSurface,
} from "@/lib/navigation/shuffleKeepAlive";
import {
  getShuffleDestinationReadiness,
  getShuffleDestinationVisualReadiness,
  getFinalShuffleRoutePresentationReadiness,
  observeFinalShuffleRoutePresentationReadinessStable,
  observeShuffleDestinationReadinessStable,
  resetFinalShuffleRoutePresentationReadinessStability,
  resetShuffleDestinationReadinessStability,
  type FinalShuffleRoutePresentationReadiness,
} from "@/lib/navigation/shuffleDestinationReadiness";
import { isShufflePoolWarmupInFlight } from "@/lib/shuffle/shufflePoolWarmup";
import {
  getMainTabShufflePresentationRuntime,
  getMainTabShufflePresentationRuntimeInstanceId,
  maybeRecoverStaleCanonicalRuntime,
  notePresentationRuntimeReusedForDiag,
  ownsCanonicalPresentationPhase,
  resetMainTabShufflePresentationRuntimeForTests,
  syncPresentationOwnerFromState,
} from "@/lib/navigation/mainTabShufflePresentationRuntime";
import {
  clearSoftCommitTxPin,
  getSoftCommitTxPin,
  isForceSoftPushModuleReinitForTestEnabled,
  markSoftCommitTxPinInFlight,
  noteLegacyRevealBlockedByPinnedTx,
  noteSoftCommitRuntimeReinitAfterSoftPush,
  noteSoftCommitTxPinRehydrated,
  noteSoftCommitTxPinRehydrationFailed,
  pinSoftCommitTx,
  shouldBlockLegacyShufflePresentationDueToPinnedTx,
  touchSoftCommitTxPin,
  validateSoftCommitTxPinForRehydrate,
} from "@/lib/navigation/mainTabShuffleSoftCommitTxPin";
import {
  canBeginMicroSlideFromWarmTrigger,
  consumeMicroSlideUserClickIntent,
  isHistoryPopstateRestoreInProgress,
  peekMicroSlideUserClickIntent,
  reportMicroSlideTransitionBeginAllowed,
  reportMicroSlideTransitionBeginBlocked,
  reportStalePinClearedNoTx,
  type MicroSlideNavTriggerType,
} from "@/lib/navigation/mainTabShuffleNavIntent";
import { isNativeAppShell } from "@/lib/app/nativeShell";
import { isMainTabToShuffleMicroSlideEnabled } from "@/lib/perf/instantaneityFlags";
import {
  isMainTabShuffleTraceDiagEnabled,
  mergeMainTabShuffleTraceRings,
  persistMainTabShuffleTraceEntry,
  type MainTabShuffleDiagTraceEvent,
} from "@/lib/perf/mainTabToShuffleTraceDiag";
import {
  bootstrapTransitionModuleLifecycleDiag,
  emitLifecycleDiag,
  emitSettleInitiated,
  emitSlideFailsafeCallbackEntered,
  emitSlideFailsafeCleared,
  emitSlideFailsafeScheduled,
  emitTransactionRefAssigned,
  emitTransactionRefCleared,
  emitTransitionEndReceived,
  emitTransitionListenerAttached,
  emitTransitionListenerRemoved,
  enrichLifecycleDiagEntry,
  getTransitionModuleInstanceId,
  isMainTabShuffleLifecycleDiagEnabled,
  nextCanonicalTransactionId,
  nextSlideFailsafeTimerId,
  noteShuffleHostObserved,
  observeHostElement,
  observeStageElement,
} from "@/lib/perf/mainTabShuffleLifecycleDiag";
import { getTraceRingIdentity } from "@/lib/perf/mainTabToShuffleTraceDiag";
import {
  emitSlideFinalTransformsWriteAttempt,
  emitSlideFinalTransformsWriteReturned,
  emitSlideFinalWriteRafCallbackEntered,
  emitSlideFinalWriteRafScheduled,
  readSlideDomInlineSnapshot,
  traceSlideDomWrite,
} from "@/lib/perf/mainTabShuffleSlideDomWriteDiag";
import {
  diagPerformanceNow,
  diagPerformanceTimeOrigin,
  emitSlideFinalWriteRafHandleAssigned,
  emitSlideFinalWriteRafScheduleRequested,
  emitSlideRafCancelAttempt,
  emitSlideRafCancelReturned,
  emitStartSlideAnimationEntered,
  emitStartSlideAnimationReturned,
  getBrowserRealmInstanceId,
  getDocumentInstanceId,
  nextFinalWriteRafSequence,
  nextStartSlideAnimationCallSequence,
} from "@/lib/perf/mainTabShuffleRafIdentityDiag";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import { countRestorableWarmFeedSlots } from "@/lib/shuffle/shufflePresentation";
import {
  isShuffleDestinationWarmIntentActive,
  settleShuffleDestinationWarmIntent,
} from "@/lib/shuffle/shuffleWarmHopIntent";

export const MAIN_TAB_TO_SHUFFLE_SLIDE_MS = 110;
export const MAIN_TAB_TO_SHUFFLE_SLIDE_EASING = "cubic-bezier(0.2, 0.72, 0.2, 1)";
/**
 * Frames after transition CSS apply before final transform write.
 * Two rAFs: frame1 commits transition-property to the rendering pipeline;
 * frame2 applies the transform delta so Chrome cannot coalesce away native start.
 * Adds ~1 frame vs the prior single-rAF final write (~8–16ms). Duration stays 110ms.
 */
export const MAIN_TAB_SHUFFLE_TRANSITION_PRECOMMIT_BARRIER_FRAMES = 2;
/**
 * Native-shell history micro-slide physical driver via Web Animations API.
 * Avoids flaky CSS transitionrun/start/end never-start under Chrome release load.
 * Duration/easing/direction unchanged. Bridge/watchdog/history commit unchanged.
 */
export const MAIN_TAB_SHUFFLE_WAAPI_COMPOSITOR_SLIDE = true;
/** Historical failsafe slack after slide duration (110 + 80 = 190). */
export const SLIDE_FAILSAFE_SLACK_MS = 80;
/** End watchdog delay from final-write commit: duration + slack. */
export const END_WATCHDOG_DELAY_MS = MAIN_TAB_TO_SHUFFLE_SLIDE_MS + SLIDE_FAILSAFE_SLACK_MS;
/** Pre-write watchdog: same budget from PHASE_SLIDING if final write never commits. */
export const PRE_WRITE_WATCHDOG_DELAY_MS = END_WATCHDOG_DELAY_MS;

export type MainTabSurface = "stories" | "chats" | "shuffle" | "boost" | "settings";
export type MainTabShuffleSource = Exclude<MainTabSurface, "shuffle">;

export type MainTabToShufflePhase =
  | "idle"
  | "preparing"
  | "armed"
  | "sliding"
  | "settled"
  | "route_bridge"
  | "aborted";

export type MainTabToShuffleDirection = "from-right" | "from-left";

export type MainTabToShuffleTransaction = {
  transactionId: string;
  navSeq: number;
  sourcePath: string;
  createdMono: number;
  source: MainTabShuffleSource;
  destination: "shuffle";
  direction: MainTabToShuffleDirection;
  phase: MainTabToShufflePhase;
  startedAtMono: number;
  destinationReadyAtMono: number | null;
  slideStartedAtMono: number | null;
  slideEndedAtMono: number | null;
  abortReason: string | null;
};

export type MainTabToShuffleTraceEvent = {
  kind:
    | "TRANSITION_BEGIN"
    | "NAVIGATION_COMMIT_NOTIFIED"
    | "READINESS_LOOP_STARTED"
    | "READINESS_SAMPLE"
    | "DESTINATION_READY"
    | "PHASE_ARMED"
    | "STAGE_INITIAL_POSITIONS_APPLIED"
    | "PHASE_SLIDING"
    | "TRANSITION_END"
    | "SETTLED"
    | "PRESENTATION_LATCH_ACQUIRED"
    | "PRESENTATION_LATCH_RELEASED"
    | "TRANSACTION_CLEANUP_STARTED"
    | "TRANSACTION_CLEANUP_COMPLETED"
    | "STAGE_MOUNTED"
    | "STAGE_UNMOUNTED"
    | "ABORTED"
    | "LEGACY_PRESENTATION_BLOCKED_BY_SLIDE_OWNER"
    | "ACTIVE_TRANSACTION_WITH_NO_PRESENTED_OWNER"
    | "PRESENTATION_OWNERSHIP_TRANSFER_STARTED"
    | "PRESENTATION_OWNERSHIP_TRANSFERRED"
    | "POST_SETTLE_ROUTE_BRIDGE_STARTED"
    | "POST_SETTLE_ROUTE_BRIDGE_COMPLETED"
    | "FINAL_ROUTE_READINESS_SAMPLE"
    | "FINAL_ROUTE_SURFACE_READY"
    | "FINAL_ROUTE_HANDOFF_FAILSAFE";
  monoMs: number;
  navSeq: number;
  pathname: string;
  phase: MainTabToShufflePhase;
  source: MainTabShuffleSource;
  direction: MainTabToShuffleDirection;
  transactionId?: string;
  readiness?: ReturnType<typeof getShuffleDestinationReadiness> | null;
  legacy?: {
    revealDeferred: boolean;
    preparing: boolean;
    surfacePresented: boolean;
    pendingDom: boolean;
  };
  stageMounted?: boolean;
  activeTxPresent?: boolean;
  presentationOwner?: number | null;
  presentationLatchActive?: boolean;
  slideDatasetValue?: string | null;
  restorableSlots?: number;
  domSlots?: number;
  warmIntentActive?: boolean;
  postSettleBridgeActive?: boolean;
  prepSurfaceDomSlots?: number;
  prepSurfaceVisibleSlots?: number;
  finalSurfaceDomSlots?: number;
  finalSurfaceVisibleSlots?: number;
  finalSurfaceMounted?: boolean;
  finalSurfaceVisible?: boolean;
  finalLoadingShellVisible?: boolean;
  stableRafSamples?: number;
  note?: string;
};

const TAB_INDEX: Record<MainTabSurface, number> = {
  stories: 0,
  chats: 1,
  shuffle: 2,
  boost: 3,
  settings: 4,
};

const PREP_FRAME_BUDGET = 120;
/** Extra budget while fresh/anon pool warmup is in flight (no-loading contract). */
const PREP_FRAME_BUDGET_WITH_WARMUP = 360;

/** Deferred /shuffle route commit — flush only when destination is no-loading ready. */
let pendingMicroSlideRouteCommit: (() => void) | null = null;
/** Cancels delayed executeShuffleRouteCommit timers (post-settle jitter path). */
let pendingShuffleRouteCommitTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * Bumped when a concrete main-tab destination supersedes an in-flight Shuffle
 * commit (Shuffle→Stories mid-slide). Stale deferred/timer pushes must no-op.
 */
let shuffleRouteCommitEpoch = 0;
/** Bumped when a concrete main-tab (Stories/Chats/Boost/Settings) supersedes Shuffle. */
let concreteMainTabSupersedeEpoch = 0;

export function registerDeferredMicroSlideRouteCommit(commit: () => void) {
  // Capture epochs at register time. If Stories supersedes before flush runs,
  // executeShuffleRouteCommit must not re-arm under the post-cancel epoch.
  const epochAtRegister = shuffleRouteCommitEpoch;
  const supersedeAtRegister = concreteMainTabSupersedeEpoch;
  pendingMicroSlideRouteCommit = () => {
    if (epochAtRegister !== shuffleRouteCommitEpoch) return;
    if (supersedeAtRegister !== concreteMainTabSupersedeEpoch) return;
    commit();
  };
}

export function clearDeferredMicroSlideRouteCommit(_reason?: string) {
  pendingMicroSlideRouteCommit = null;
}

/** Invalidate any pending/deferred /shuffle route commit (timer + callback). */
export function cancelPendingShuffleRouteCommits(reason?: string) {
  shuffleRouteCommitEpoch += 1;
  clearDeferredMicroSlideRouteCommit(reason);
  if (pendingShuffleRouteCommitTimer != null) {
    clearTimeout(pendingShuffleRouteCommitTimer);
    pendingShuffleRouteCommitTimer = null;
  }
}

/** Mark that a concrete main-tab destination replaced an in-flight Shuffle commit. */
export function noteConcreteMainTabSupersede(_href?: string) {
  concreteMainTabSupersedeEpoch += 1;
}

export function getConcreteMainTabSupersedeEpoch() {
  return concreteMainTabSupersedeEpoch;
}

export function getShuffleRouteCommitEpoch() {
  return shuffleRouteCommitEpoch;
}

export function scheduleShuffleRouteCommit(
  run: () => void,
  delayMs: number,
): void {
  const epoch = shuffleRouteCommitEpoch;
  const exec = () => {
    if (epoch !== shuffleRouteCommitEpoch) return;
    pendingShuffleRouteCommitTimer = null;
    run();
  };
  if (delayMs > 0) {
    if (pendingShuffleRouteCommitTimer != null) {
      clearTimeout(pendingShuffleRouteCommitTimer);
    }
    pendingShuffleRouteCommitTimer = setTimeout(exec, delayMs);
    return;
  }
  exec();
}

function flushDeferredMicroSlideRouteCommit() {
  const commit = pendingMicroSlideRouteCommit;
  pendingMicroSlideRouteCommit = null;
  if (!commit) return;
  // Superseded by a concrete main-tab tap (e.g. Stories during slide).
  const activeTx = rt().activeTx;
  if (!activeTx || activeTx.phase === "aborted") return;
  pushTrace("NAVIGATION_COMMIT_NOTIFIED", {
    note: "MICRO_SLIDE_READY_AFTER_WARMUP:route-commit-flushed",
  });
  // Wrapper installed by registerDeferredMicroSlideRouteCommit also
  // no-ops when epoch/supersede advanced after register.
  commit();
}

function getPrepFrameBudget() {
  return isShufflePoolWarmupInFlight() ? PREP_FRAME_BUDGET_WITH_WARMUP : PREP_FRAME_BUDGET;
}
/** Prod gap latch→route commit ~597ms; recovery ~794ms — 1800ms margin. */
const POST_SETTLE_BRIDGE_FAILSAFE_MS = 1800;
const POST_SETTLE_BRIDGE_FAILSAFE_RETRY_MS = 400;
const TRACE_RING_MAX = 240;

const TRANSITION_MODULE_CREATED_MONO =
  typeof performance !== "undefined"
    ? Math.round(performance.timeOrigin + performance.now())
    : 0;
const TRANSITION_MODULE_INSTANCE_ID = `module-${TRANSITION_MODULE_CREATED_MONO}-${Math.random().toString(36).slice(2, 8)}`;

/** Module-local metrics only — canonical ownership lives in global presentation runtime. */
let latchAcquisitions = 0;
let latchReleasesByFinalRoute = 0;
let latchReleasesByFailsafe = 0;
const latchLifetimeSamplesMs: number[] = [];
let bridgeFailsafeCount = 0;
let bridgeStartCount = 0;
let bridgeCompleteCount = 0;
let ownershipTransferCount = 0;
let bridgeReadinessSampleCount = 0;
const bridgeLifetimeSamplesMs: number[] = [];
const finalRouteReadinessWaitSamplesMs: number[] = [];
let traceRing: MainTabToShuffleTraceEvent[] = [];

/** Module-local WAAPI handles — not presentation-runtime / bridge state. */
let activeWaapiAnimations: Animation[] = [];
let activeWaapiTxId: string | null = null;
/** Canonical WAAPI settle — fill-release cancels must not override physical satisfaction. */
let waapiCanonicalPhysicalSatisfied = false;
let waapiFillReleaseStarted = false;
let waapiTerminalState:
  | "pending"
  | "ready"
  | "running"
  | "finished-native"
  | "finished-promoted"
  | "physical-satisfied"
  | "cleanup-cancelled-after-finish"
  | "cancelled-before-physical"
  | "rejected"
  | "unavailable"
  | "stale-aborted" = "pending";
let activeWaapiCancelHandlers: Array<(ev: Event) => void> = [];

function resetWaapiCanonicalSettleState() {
  waapiCanonicalPhysicalSatisfied = false;
  waapiFillReleaseStarted = false;
  waapiTerminalState = "pending";
  activeWaapiCancelHandlers = [];
}

function emitWaapiTerminalReduced(args: {
  prior: typeof waapiTerminalState;
  next: typeof waapiTerminalState;
  baseFields: () => Record<string, unknown>;
  animationIds?: string[];
  cancelReason?: string | null;
  promoteReason?: string | null;
  watchdogReason?: string | null;
}) {
  const {
    prior,
    next,
    baseFields,
    animationIds,
    cancelReason = null,
    promoteReason = null,
    watchdogReason = null,
  } = args;
  waapiTerminalState = next;
  emitArmingDiag({
    kind: "MICRO_SLIDE_WAAPI_TERMINAL_STATE_REDUCED",
    ...baseFields(),
    monoMs: monoMs(),
    priorTerminalState: prior,
    terminalState: next,
    physicalSatisfiedBeforeEvent: prior === "physical-satisfied" ||
      prior === "finished-native" ||
      prior === "finished-promoted" ||
      prior === "cleanup-cancelled-after-finish" ||
      waapiCanonicalPhysicalSatisfied,
    physicalSatisfiedAfterEvent:
      next === "physical-satisfied" ||
      next === "finished-native" ||
      next === "finished-promoted" ||
      next === "cleanup-cancelled-after-finish" ||
      waapiCanonicalPhysicalSatisfied,
    finalStylesCommitted: waapiCanonicalPhysicalSatisfied,
    fillReleaseStarted: waapiFillReleaseStarted,
    cancelReason,
    promoteReason,
    watchdogReason,
    animationIds: animationIds ?? [],
    duration: MAIN_TAB_TO_SHUFFLE_SLIDE_MS,
    easing: MAIN_TAB_TO_SHUFFLE_SLIDE_EASING,
    commitMode: "history",
  });
}

function rt() {
  return getMainTabShufflePresentationRuntime();
}

function shouldSelectWaapiCompositorSlide(): boolean {
  if (!MAIN_TAB_SHUFFLE_WAAPI_COMPOSITOR_SLIDE) return false;
  if (!isMainTabToShuffleMicroSlideEnabled()) return false;
  if (typeof window === "undefined") return false;
  // Native shell micro-slide uses history commit; web/non-native keeps CSS/soft path.
  return isNativeAppShell();
}

function cancelActiveWaapiAnimations(reason: string) {
  const animations = activeWaapiAnimations.slice();
  activeWaapiAnimations = [];
  const txId = activeWaapiTxId;
  activeWaapiTxId = null;
  for (const anim of animations) {
    try {
      anim.cancel();
    } catch {
      /* ignore */
    }
  }
  if (animations.length > 0) {
    emitArmingDiag({
      kind: "MICRO_SLIDE_WAAPI_CLEANUP_DONE",
      transactionId: txId,
      txId,
      reason,
      animationCount: animations.length,
      moduleInstanceId: TRANSITION_MODULE_INSTANCE_ID,
      runtimeInstanceId: rt().runtimeInstanceId,
      monoMs: monoMs(),
    });
  }
}

function waapiKeyframePair(direction: MainTabToShuffleDirection) {
  if (direction === "from-right") {
    return {
      source: ["translate3d(0, 0, 0)", "translate3d(-100%, 0, 0)"] as const,
      destination: ["translate3d(100%, 0, 0)", "translate3d(0, 0, 0)"] as const,
    };
  }
  return {
    source: ["translate3d(0, 0, 0)", "translate3d(100%, 0, 0)"] as const,
    destination: ["translate3d(-100%, 0, 0)", "translate3d(0, 0, 0)"] as const,
  };
}

function monoMs() {
  if (typeof performance === "undefined") return 0;
  return Math.round(performance.timeOrigin + performance.now());
}

function pathnameNow() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.split("?")[0].split("#")[0];
}

function notify() {
  rt().listeners.forEach((listener) => listener());
}

function sourceHostId(source: MainTabShuffleSource) {
  return `sayittome-main-tab-keepalive-${source}`;
}

function directionForSource(source: MainTabShuffleSource): MainTabToShuffleDirection {
  return TAB_INDEX[source] < TAB_INDEX.shuffle ? "from-right" : "from-left";
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isCurrentBridgeObserverOwner() {
  return rt().bridgeObserverOwnerModuleId === TRANSITION_MODULE_INSTANCE_ID;
}

function traceDiagExtras(): Pick<
  MainTabToShuffleTraceEvent,
  | "activeTxPresent"
  | "presentationOwner"
  | "presentationLatchActive"
  | "slideDatasetValue"
  | "restorableSlots"
  | "domSlots"
  | "warmIntentActive"
  | "postSettleBridgeActive"
  | "prepSurfaceDomSlots"
  | "prepSurfaceVisibleSlots"
  | "finalSurfaceDomSlots"
  | "finalSurfaceVisibleSlots"
  | "finalSurfaceMounted"
  | "finalSurfaceVisible"
  | "finalLoadingShellVisible"
> {
  const runtime = rt();
  const prepReadiness = getShuffleDestinationReadiness();
  const finalReadiness = getFinalShuffleRoutePresentationReadiness();
  return {
    activeTxPresent: Boolean(runtime.activeTx),
    presentationOwner: runtime.presentationLatchNavSeq,
    presentationLatchActive: runtime.presentationLatchNavSeq !== null,
    slideDatasetValue:
      typeof document !== "undefined"
        ? document.documentElement.getAttribute("data-main-tab-shuffle-slide")
        : null,
    restorableSlots: countRestorableWarmFeedSlots(),
    domSlots: prepReadiness.domSlots,
    warmIntentActive: isShuffleDestinationWarmIntentActive(),
    postSettleBridgeActive: runtime.postSettleBridgeActive,
    prepSurfaceDomSlots: prepReadiness.domSlots,
    prepSurfaceVisibleSlots: prepReadiness.visibleSlots,
    finalSurfaceDomSlots: finalReadiness.finalSurfaceDomSlots,
    finalSurfaceVisibleSlots: finalReadiness.finalSurfaceVisibleSlots,
    finalSurfaceMounted: finalReadiness.finalSurfaceMounted,
    finalSurfaceVisible: finalReadiness.finalSurfaceVisible,
    finalLoadingShellVisible: finalReadiness.finalSurfaceLoadingShellVisible,
  };
}

function pushTrace(
  kind: MainTabToShuffleTraceEvent["kind"],
  extras?: Partial<MainTabToShuffleTraceEvent>,
) {
  const runtime = rt();
  const tx = runtime.activeTx;
  const entry: MainTabToShuffleTraceEvent = {
    kind,
    monoMs: monoMs(),
    navSeq: tx?.navSeq ?? runtime.navSeq,
    pathname: pathnameNow(),
    phase: tx?.phase ?? "idle",
    source: tx?.source ?? "chats",
    direction: tx?.direction ?? "from-right",
    transactionId: tx?.transactionId,
    ...traceDiagExtras(),
    ...extras,
  };
  traceRing.push(entry);
  if (traceRing.length > TRACE_RING_MAX) traceRing.shift();
  if (isMainTabShuffleTraceDiagEnabled()) {
    persistMainTabShuffleTraceEntry(
      enrichLifecycleDiagEntry(entry as MainTabShuffleDiagTraceEvent),
    );
  }
}

function emitArmingDiag(payload: Record<string, unknown>) {
  emitLifecycleDiag(payload as Parameters<typeof emitLifecycleDiag>[0]);
}

function recordDiagOnlyTrace(
  kind: MainTabToShuffleTraceEvent["kind"],
  navSeq: number,
  phase: MainTabToShufflePhase,
  source: MainTabShuffleSource | null,
  direction: MainTabToShuffleDirection | null,
  extras?: Partial<MainTabToShuffleTraceEvent>,
) {
  const entry: MainTabToShuffleTraceEvent = {
    kind,
    monoMs: monoMs(),
    navSeq,
    pathname: pathnameNow(),
    phase,
    source: source ?? "chats",
    direction: direction ?? "from-right",
    ...traceDiagExtras(),
    ...extras,
  };
  traceRing.push(entry);
  if (traceRing.length > TRACE_RING_MAX) traceRing.shift();
  if (isMainTabShuffleLifecycleDiagEnabled()) {
    persistMainTabShuffleTraceEntry(
      enrichLifecycleDiagEntry(entry as MainTabShuffleDiagTraceEvent),
    );
  }
}

function clearTransactionRef(caller: string, reason: string) {
  const runtime = rt();
  const tx = runtime.activeTx;
  if (!tx) return;
  emitTransactionRefCleared(tx.transactionId, tx.phase, caller, reason, tx.navSeq);
  runtime.activeTx = null;
  syncPresentationOwnerFromState(runtime);
  clearSoftCommitTxPin(reason, {
    moduleInstanceId: TRANSITION_MODULE_INSTANCE_ID,
    runtimeInstanceId: runtime.runtimeInstanceId,
    activeTxPresent: false,
  });
}

/**
 * Reattach a soft-commit pinned tx onto the current presentation runtime after
 * same-document module/runtime re-init. Restarts readiness when phase is preparing.
 */
function rehydrateSoftCommitPinnedTxAfterModuleReinit(moduleInstanceId: string): boolean {
  const runtime = rt();
  const existingId = runtime.activeTx?.transactionId ?? null;
  const validated = validateSoftCommitTxPinForRehydrate({
    pathname: pathnameNow(),
    existingActiveTxId: existingId,
  });
  if (!validated.ok) {
    noteSoftCommitTxPinRehydrationFailed(validated.reason, {
      moduleInstanceId,
      runtimeInstanceId: runtime.runtimeInstanceId,
    });
    return false;
  }
  const pin = validated.pin;
  if (validated.reason === "already-present" && runtime.activeTx) {
    touchSoftCommitTxPin(runtime.activeTx.phase);
    noteSoftCommitTxPinRehydrated({
      moduleInstanceId,
      runtimeInstanceId: runtime.runtimeInstanceId,
      activeTxPresent: true,
    });
    return true;
  }

  runtime.navSeq = Math.max(runtime.navSeq, pin.navSeq);
  if (runtime.presentationLatchNavSeq === null) {
    armPresentationLatch(pin.navSeq);
  }
  runtime.activeTx = {
    transactionId: pin.txId,
    navSeq: pin.navSeq,
    sourcePath: pin.sourcePath,
    createdMono: pin.createdMono,
    source: pin.sourceTab as MainTabShuffleSource,
    destination: "shuffle",
    direction: pin.direction,
    phase: pin.phase === "idle" || pin.phase === "aborted" ? "preparing" : pin.phase,
    startedAtMono: pin.startedAtMono,
    destinationReadyAtMono: pin.destinationReadyAtMono,
    slideStartedAtMono: pin.slideStartedAtMono,
    slideEndedAtMono: pin.slideEndedAtMono,
    abortReason: pin.abortReason,
  };
  syncPresentationOwnerFromState(runtime);
  emitTransactionRefAssigned(
    pin.txId,
    pin.navSeq,
    pin.sourcePath,
    pin.createdMono,
    runtime.activeTx.phase,
  );
  touchSoftCommitTxPin(runtime.activeTx.phase);
  noteSoftCommitTxPinRehydrated({
    moduleInstanceId,
    runtimeInstanceId: runtime.runtimeInstanceId,
    activeTxPresent: true,
  });
  pushTrace("TRANSITION_BEGIN", {
    note: `rehydrated-after-module-reinit|recovery=${pin.recoveryCount}|tx=${pin.txId}`,
    transactionId: pin.txId,
  });
  applyPreparingDomState(runtime.activeTx.source);
  notify();
  if (runtime.activeTx.phase === "preparing") {
    startReadinessLoop();
  } else if (runtime.activeTx.phase === "armed") {
    applyArmedDomState();
    if (prefersReducedMotion()) {
      atomicReadySwap();
    } else {
      requestAnimationFrame(() => {
        const armed = rt().activeTx;
        if (!armed || armed.phase !== "armed") return;
        startSlideAnimation();
      });
    }
  }
  return true;
}

function clearPreWriteWatchdog(caller: string, reason: string) {
  const runtime = rt();
  const tx = runtime.activeTx;
  const timerId = runtime.slidePreWriteWatchdogId;
  if (!timerId && !runtime.slidePreWriteWatchdogHandle) {
    runtime.slidePreWriteWatchdogHandle = null;
    runtime.slidePreWriteWatchdogId = null;
    runtime.slidePreWriteWatchdogScheduledTransactionId = null;
    return;
  }
  if (timerId) {
    emitLifecycleDiag({
      kind: "SLIDE_PRE_WRITE_WATCHDOG_CLEARED",
      timerId,
      transactionId: runtime.slidePreWriteWatchdogScheduledTransactionId,
      caller,
      reason: `pre-write:${reason}`,
      phase: tx?.phase ?? "idle",
      navSeq: tx?.navSeq ?? runtime.navSeq,
      runtimeInstanceId: runtime.runtimeInstanceId,
    });
    emitSlideFailsafeCleared({
      timerId,
      transactionId: runtime.slidePreWriteWatchdogScheduledTransactionId,
      caller,
      reason: `pre-write:${reason}`,
      phase: tx?.phase ?? "idle",
      navSeq: tx?.navSeq ?? runtime.navSeq,
    });
  }
  if (runtime.slidePreWriteWatchdogHandle) {
    clearTimeout(runtime.slidePreWriteWatchdogHandle);
  }
  runtime.slidePreWriteWatchdogHandle = null;
  runtime.slidePreWriteWatchdogId = null;
  runtime.slidePreWriteWatchdogScheduledTransactionId = null;
}

function clearPostWritePreStartWatchdog(caller: string, reason: string) {
  const runtime = rt();
  const tx = runtime.activeTx;
  const timerId = runtime.slidePostWritePreStartWatchdogId;
  if (!timerId && !runtime.slidePostWritePreStartWatchdogHandle) {
    runtime.slidePostWritePreStartWatchdogHandle = null;
    runtime.slidePostWritePreStartWatchdogId = null;
    runtime.slidePostWritePreStartWatchdogScheduledTransactionId = null;
    return;
  }
  if (timerId) {
    emitLifecycleDiag({
      kind: "SLIDE_POST_WRITE_PRE_START_WATCHDOG_CLEARED",
      timerId,
      transactionId: runtime.slidePostWritePreStartWatchdogScheduledTransactionId,
      caller,
      reason: `pre-start:${reason}`,
      phase: tx?.phase ?? "idle",
      navSeq: tx?.navSeq ?? runtime.navSeq,
      slideFinalWriteCommittedMono: runtime.slideFinalWriteCommittedMono,
      runtimeInstanceId: runtime.runtimeInstanceId,
    });
  }
  if (runtime.slidePostWritePreStartWatchdogHandle) {
    clearTimeout(runtime.slidePostWritePreStartWatchdogHandle);
  }
  runtime.slidePostWritePreStartWatchdogHandle = null;
  runtime.slidePostWritePreStartWatchdogId = null;
  runtime.slidePostWritePreStartWatchdogScheduledTransactionId = null;
}

function clearEndWatchdog(caller: string, reason: string) {
  const runtime = rt();
  const tx = runtime.activeTx;
  const timerId = runtime.slideEndWatchdogId;
  if (!timerId && !runtime.slideEndWatchdogHandle) {
    runtime.slideEndWatchdogHandle = null;
    runtime.slideEndWatchdogId = null;
    runtime.slideEndWatchdogScheduledTransactionId = null;
    runtime.slideFailSafeTimer = null;
    runtime.activeSlideFailsafeTimerId = null;
    runtime.activeSlideFailsafeScheduledTransactionId = null;
    return;
  }
  if (timerId) {
    emitLifecycleDiag({
      kind: "SLIDE_END_WATCHDOG_CLEARED",
      timerId,
      transactionId: runtime.slideEndWatchdogScheduledTransactionId,
      caller,
      reason: `end:${reason}`,
      phase: tx?.phase ?? "idle",
      navSeq: tx?.navSeq ?? runtime.navSeq,
      slideTransitionStartedMono: runtime.slideTransitionStartedMono,
      runtimeInstanceId: runtime.runtimeInstanceId,
    });
    emitSlideFailsafeCleared({
      timerId,
      transactionId: runtime.slideEndWatchdogScheduledTransactionId,
      caller,
      reason: `end:${reason}`,
      phase: tx?.phase ?? "idle",
      navSeq: tx?.navSeq ?? runtime.navSeq,
    });
  }
  if (runtime.slideEndWatchdogHandle) {
    clearTimeout(runtime.slideEndWatchdogHandle);
  }
  runtime.slideEndWatchdogHandle = null;
  runtime.slideEndWatchdogId = null;
  runtime.slideEndWatchdogScheduledTransactionId = null;
  runtime.slideFailSafeTimer = null;
  runtime.activeSlideFailsafeTimerId = null;
  runtime.activeSlideFailsafeScheduledTransactionId = null;
}

function clearAllSlideWatchdogs(caller: string, reason: string) {
  clearPreWriteWatchdog(caller, reason);
  clearPostWritePreStartWatchdog(caller, reason);
  clearEndWatchdog(caller, reason);
  const runtime = rt();
  runtime.slideFinalWriteCommittedMono = null;
  runtime.sourceTransitionStartedMono = null;
  runtime.destinationTransitionStartedMono = null;
  runtime.slideTransitionStartedMono = null;
}

function armPreWriteWatchdog(tx: MainTabToShuffleTransaction) {
  const runtime = rt();
  clearPreWriteWatchdog("armPreWriteWatchdog", "reschedule");
  const timerId = nextSlideFailsafeTimerId();
  const expectedFireMono = monoMs() + PRE_WRITE_WATCHDOG_DELAY_MS;
  runtime.slidePreWriteWatchdogId = timerId;
  runtime.slidePreWriteWatchdogScheduledTransactionId = tx.transactionId;
  emitLifecycleDiag({
    kind: "SLIDE_PRE_WRITE_WATCHDOG_SCHEDULED",
    timerId,
    expectedFireMono,
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
    slideDurationMs: MAIN_TAB_TO_SHUFFLE_SLIDE_MS,
    slackMs: SLIDE_FAILSAFE_SLACK_MS,
    runtimeInstanceId: runtime.runtimeInstanceId,
  });
  emitSlideFailsafeScheduled({
    timerId,
    expectedFireMono,
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
  });
  runtime.slidePreWriteWatchdogHandle = setTimeout(() => {
    const currentRuntime = rt();
    const scheduledId = currentRuntime.slidePreWriteWatchdogScheduledTransactionId;
    const current = currentRuntime.activeTx;
    emitLifecycleDiag({
      kind: "SLIDE_PRE_WRITE_WATCHDOG_CALLBACK_ENTERED",
      timerId,
      scheduledTransactionId: scheduledId,
      currentTransactionId: current?.transactionId ?? null,
      currentPhase: current?.phase ?? null,
      navSeq: current?.navSeq ?? currentRuntime.navSeq,
      runtimeInstanceId: currentRuntime.runtimeInstanceId,
    });
    emitSlideFailsafeCallbackEntered({
      timerId,
      scheduledTransactionId: scheduledId,
      currentTransactionId: current?.transactionId ?? null,
      currentPhase: current?.phase ?? null,
      navSeq: current?.navSeq ?? currentRuntime.navSeq,
    });
    if (
      current?.phase === "sliding" &&
      current.transactionId === scheduledId &&
      currentRuntime.slideFinalWriteCommittedMono == null
    ) {
      emitSettleInitiated({
        caller: "armPreWriteWatchdog",
        reason: "final-write-never-committed",
        transactionId: current.transactionId,
        phase: current.phase,
        navSeq: current.navSeq,
        timerId,
      });
      finishSlideSettled("final-write-never-committed");
    }
  }, PRE_WRITE_WATCHDOG_DELAY_MS);
}

function armPostWritePreStartWatchdog(tx: MainTabToShuffleTransaction, committedMono: number) {
  const runtime = rt();
  if (runtime.slideFinalWriteCommittedMono == null) return;
  clearPostWritePreStartWatchdog("armPostWritePreStartWatchdog", "reschedule");
  const timerId = nextSlideFailsafeTimerId();
  const expectedFireMono = committedMono + END_WATCHDOG_DELAY_MS;
  const delayMs = Math.max(0, expectedFireMono - monoMs());
  runtime.slidePostWritePreStartWatchdogId = timerId;
  runtime.slidePostWritePreStartWatchdogScheduledTransactionId = tx.transactionId;
  emitLifecycleDiag({
    kind: "SLIDE_POST_WRITE_PRE_START_WATCHDOG_SCHEDULED",
    timerId,
    expectedFireMono,
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
    slideFinalWriteCommittedMono: committedMono,
    slideDurationMs: MAIN_TAB_TO_SHUFFLE_SLIDE_MS,
    slackMs: SLIDE_FAILSAFE_SLACK_MS,
    runtimeInstanceId: runtime.runtimeInstanceId,
  });
  runtime.slidePostWritePreStartWatchdogHandle = setTimeout(() => {
    const currentRuntime = rt();
    const scheduledId = currentRuntime.slidePostWritePreStartWatchdogScheduledTransactionId;
    const current = currentRuntime.activeTx;
    emitLifecycleDiag({
      kind: "SLIDE_POST_WRITE_PRE_START_WATCHDOG_CALLBACK_ENTERED",
      timerId,
      scheduledTransactionId: scheduledId,
      currentTransactionId: current?.transactionId ?? null,
      currentPhase: current?.phase ?? null,
      navSeq: current?.navSeq ?? currentRuntime.navSeq,
      slideFinalWriteCommittedMono: currentRuntime.slideFinalWriteCommittedMono,
      slideTransitionStartedMono: currentRuntime.slideTransitionStartedMono,
      runtimeInstanceId: currentRuntime.runtimeInstanceId,
    });
    if (current?.phase !== "sliding" || current.transactionId !== scheduledId) return;
    if (currentRuntime.slideTransitionStartedMono != null) return;
    emitSettleInitiated({
      caller: "armPostWritePreStartWatchdog",
      reason: "transition-never-started-after-final-write",
      transactionId: current.transactionId,
      phase: current.phase,
      navSeq: current.navSeq,
      timerId,
    });
    finishSlideSettled("transition-never-started-after-final-write");
  }, delayMs);
}

function armEndWatchdogFromTransitionStart(
  tx: MainTabToShuffleTransaction,
  startedMono: number,
  reason: string,
) {
  const runtime = rt();
  if (runtime.slideTransitionStartedMono == null) return;
  clearEndWatchdog("armEndWatchdogFromTransitionStart", reason);
  const timerId = nextSlideFailsafeTimerId();
  const expectedFireMono = startedMono + END_WATCHDOG_DELAY_MS;
  const delayMs = Math.max(0, expectedFireMono - monoMs());
  runtime.slideEndWatchdogId = timerId;
  runtime.slideEndWatchdogScheduledTransactionId = tx.transactionId;
  runtime.activeSlideFailsafeTimerId = timerId;
  runtime.activeSlideFailsafeScheduledTransactionId = tx.transactionId;
  emitLifecycleDiag({
    kind: "SLIDE_END_WATCHDOG_SCHEDULED",
    timerId,
    expectedFireMono,
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
    slideFinalWriteCommittedMono: runtime.slideFinalWriteCommittedMono,
    sourceTransitionStartedMono: runtime.sourceTransitionStartedMono,
    destinationTransitionStartedMono: runtime.destinationTransitionStartedMono,
    slideTransitionStartedMono: startedMono,
    slideDurationMs: MAIN_TAB_TO_SHUFFLE_SLIDE_MS,
    slackMs: SLIDE_FAILSAFE_SLACK_MS,
    reason,
    runtimeInstanceId: runtime.runtimeInstanceId,
  });
  emitSlideFailsafeScheduled({
    timerId,
    expectedFireMono,
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
  });
  runtime.slideEndWatchdogHandle = setTimeout(() => {
    const currentRuntime = rt();
    const scheduledId = currentRuntime.slideEndWatchdogScheduledTransactionId;
    const current = currentRuntime.activeTx;
    const startMono = currentRuntime.slideTransitionStartedMono;
    emitLifecycleDiag({
      kind: "SLIDE_END_WATCHDOG_CALLBACK_ENTERED",
      timerId,
      scheduledTransactionId: scheduledId,
      currentTransactionId: current?.transactionId ?? null,
      currentPhase: current?.phase ?? null,
      navSeq: current?.navSeq ?? currentRuntime.navSeq,
      slideTransitionStartedMono: startMono,
      runtimeInstanceId: currentRuntime.runtimeInstanceId,
    });
    emitSlideFailsafeCallbackEntered({
      timerId,
      scheduledTransactionId: scheduledId,
      currentTransactionId: current?.transactionId ?? null,
      currentPhase: current?.phase ?? null,
      navSeq: current?.navSeq ?? currentRuntime.navSeq,
    });
    if (current?.phase !== "sliding" || current.transactionId !== scheduledId) return;
    if (startMono == null) return;
    const now = monoMs();
    // Never settle before chosenStart + slide duration.
    if (now < startMono + MAIN_TAB_TO_SHUFFLE_SLIDE_MS) return;
    emitSettleInitiated({
      caller: "armEndWatchdogFromTransitionStart",
      reason: "post-transition-start-end-watchdog",
      transactionId: current.transactionId,
      phase: current.phase,
      navSeq: current.navSeq,
      timerId,
    });
    finishSlideSettled("post-transition-start-end-watchdog");
  }, delayMs);
  runtime.slideFailSafeTimer = runtime.slideEndWatchdogHandle;
}

function noteSlideFinalWriteCommitted(tx: MainTabToShuffleTransaction) {
  const runtime = rt();
  if (runtime.slideFinalWriteCommittedMono != null) return;
  runtime.slideFinalWriteCommittedMono = monoMs();
  clearPreWriteWatchdog("noteSlideFinalWriteCommitted", "final-write-committed");
  emitLifecycleDiag({
    kind: "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL",
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
    slideFinalWriteCommittedMono: runtime.slideFinalWriteCommittedMono,
    runtimeInstanceId: runtime.runtimeInstanceId,
  });
  armPostWritePreStartWatchdog(tx, runtime.slideFinalWriteCommittedMono);
}

function noteNativeTransitionStart(
  tx: MainTabToShuffleTransaction,
  nodeRole: "source" | "destination",
  startMono: number,
  propertyName: string,
) {
  const runtime = rt();
  if (tx.phase !== "sliding") return;
  if (runtime.slideFinalWriteCommittedMono == null) return;
  if (propertyName !== "transform") return;

  if (nodeRole === "source") {
    if (runtime.sourceTransitionStartedMono != null) return;
    runtime.sourceTransitionStartedMono = startMono;
  } else {
    if (runtime.destinationTransitionStartedMono != null) return;
    runtime.destinationTransitionStartedMono = startMono;
  }

  emitLifecycleDiag({
    kind: "SLIDE_NATIVE_TRANSITION_START_OBSERVED",
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
    nodeRole,
    propertyName,
    slideFinalWriteCommittedMono: runtime.slideFinalWriteCommittedMono,
    sourceTransitionStartedMono: runtime.sourceTransitionStartedMono,
    destinationTransitionStartedMono: runtime.destinationTransitionStartedMono,
    runtimeInstanceId: runtime.runtimeInstanceId,
  });

  const candidates = [
    runtime.sourceTransitionStartedMono,
    runtime.destinationTransitionStartedMono,
  ].filter((v): v is number => v != null);
  if (!candidates.length) return;

  const lastStart = Math.max(...candidates);
  const previous = runtime.slideTransitionStartedMono;
  const isFirst = previous == null;
  const isLater = previous != null && lastStart > previous;
  if (!isFirst && !isLater) return;

  runtime.slideTransitionStartedMono = lastStart;
  clearPostWritePreStartWatchdog(
    "noteNativeTransitionStart",
    isFirst ? "first-valid-transition-start" : "later-surface-start",
  );
  emitLifecycleDiag({
    kind: "SLIDE_TRANSITION_START_ANCHOR_COMMITTED",
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
    nodeRole,
    slideFinalWriteCommittedMono: runtime.slideFinalWriteCommittedMono,
    sourceTransitionStartedMono: runtime.sourceTransitionStartedMono,
    destinationTransitionStartedMono: runtime.destinationTransitionStartedMono,
    slideTransitionStartedMono: lastStart,
    reason: isFirst ? "first-valid-start" : "reanchor-later-start",
    runtimeInstanceId: runtime.runtimeInstanceId,
  });
  armEndWatchdogFromTransitionStart(
    tx,
    lastStart,
    isFirst ? "first-valid-start" : "reanchor-later-start",
  );
}

function noteNativeTransitionRun(
  tx: MainTabToShuffleTransaction,
  nodeRole: "source" | "destination",
  propertyName: string,
) {
  if (propertyName !== "transform") return;
  emitLifecycleDiag({
    kind: "SLIDE_NATIVE_TRANSITION_RUN_OBSERVED",
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
    nodeRole,
    propertyName,
    slideFinalWriteCommittedMono: rt().slideFinalWriteCommittedMono,
    runtimeInstanceId: rt().runtimeInstanceId,
  });
}

function armPresentationLatch(seq: number) {
  const runtime = rt();
  const tx = runtime.activeTx;
  latchAcquisitions += 1;
  runtime.latchArmedAtMono = monoMs();
  runtime.presentationLatchNavSeq = seq;
  runtime.presentationLatchTransactionId = tx?.transactionId ?? null;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-main-tab-shuffle-owner", String(seq));
  }
  syncPresentationOwnerFromState(runtime);
  recordDiagOnlyTrace(
    "PRESENTATION_LATCH_ACQUIRED",
    seq,
    tx?.phase ?? "idle",
    tx?.source ?? null,
    tx?.direction ?? null,
    { note: `navSeq=${seq}` },
  );
}

function releasePresentationLatch() {
  const runtime = rt();
  runtime.presentationLatchNavSeq = null;
  runtime.presentationLatchTransactionId = null;
  if (typeof document !== "undefined") {
    document.documentElement.removeAttribute("data-main-tab-shuffle-owner");
  }
  syncPresentationOwnerFromState(runtime);
}

function cancelScheduledPresentationLatchRelease() {
  const runtime = rt();
  if (runtime.latchReleaseRaf !== null && typeof cancelAnimationFrame === "function") {
    emitSlideRafCancelAttempt({
      caller: "cancelScheduledPresentationLatchRelease",
      reason: "cancel-latch-release-raf",
      handle: runtime.latchReleaseRaf,
      fieldName: "latchReleaseRaf",
      transactionId: runtime.activeTx?.transactionId ?? null,
      phase: runtime.activeTx?.phase ?? "idle",
      navSeq: runtime.activeTx?.navSeq ?? runtime.navSeq,
      currentStoredRafHandle: runtime.diagFinalWriteRafHandle,
      currentStoredRafSequence: runtime.diagFinalWriteRafSequence,
    });
    cancelAnimationFrame(runtime.latchReleaseRaf);
    emitSlideRafCancelReturned({
      caller: "cancelScheduledPresentationLatchRelease",
      reason: "cancel-latch-release-raf",
      handle: runtime.latchReleaseRaf,
      fieldName: "latchReleaseRaf",
      transactionId: runtime.activeTx?.transactionId ?? null,
      phase: runtime.activeTx?.phase ?? "idle",
      navSeq: runtime.activeTx?.navSeq ?? runtime.navSeq,
      currentStoredRafHandle: runtime.diagFinalWriteRafHandle,
      currentStoredRafSequence: runtime.diagFinalWriteRafSequence,
    });
  }
  runtime.latchReleaseRaf = null;
}

type LatchReleaseReason = "final-route-ready" | "failsafe-recovery";

function cancelPostSettleBridgeObservation() {
  const runtime = rt();
  if (runtime.bridgeRaf !== null && typeof cancelAnimationFrame === "function") {
    emitSlideRafCancelAttempt({
      caller: "cancelPostSettleBridgeObservation",
      reason: "cancel-bridge-raf",
      handle: runtime.bridgeRaf,
      fieldName: "bridgeRaf",
      transactionId: runtime.activeTx?.transactionId ?? null,
      phase: runtime.activeTx?.phase ?? "idle",
      navSeq: runtime.activeTx?.navSeq ?? runtime.navSeq,
      currentStoredRafHandle: runtime.diagFinalWriteRafHandle,
      currentStoredRafSequence: runtime.diagFinalWriteRafSequence,
    });
    cancelAnimationFrame(runtime.bridgeRaf);
    emitSlideRafCancelReturned({
      caller: "cancelPostSettleBridgeObservation",
      reason: "cancel-bridge-raf",
      handle: runtime.bridgeRaf,
      fieldName: "bridgeRaf",
      transactionId: runtime.activeTx?.transactionId ?? null,
      phase: runtime.activeTx?.phase ?? "idle",
      navSeq: runtime.activeTx?.navSeq ?? runtime.navSeq,
      currentStoredRafHandle: runtime.diagFinalWriteRafHandle,
      currentStoredRafSequence: runtime.diagFinalWriteRafSequence,
    });
  }
  runtime.bridgeRaf = null;
  if (runtime.bridgeFailsafeTimer) {
    clearTimeout(runtime.bridgeFailsafeTimer);
    runtime.bridgeFailsafeTimer = null;
  }
}

/** Canonical post-settle completion — only normal path for latch + warm intent release. */
function completeFinalShufflePresentationHandoff(
  reason: LatchReleaseReason,
  finalReadiness: FinalShuffleRoutePresentationReadiness,
) {
  const runtime = rt();
  const tx = runtime.activeTx;
  if (!tx || tx.phase !== "route_bridge" || !runtime.postSettleBridgeActive) return false;

  if (pathnameNow() !== "/shuffle") return false;
  if (!finalReadiness.ready) return false;
  if (finalReadiness.finalSurfaceDomSlots < 3) return false;
  if (finalReadiness.finalSurfaceLoadingShellVisible) return false;
  if (!isMainTabToShufflePresentationLatchActive()) return false;

  const prepReadiness = getShuffleDestinationReadiness();
  if (prepReadiness.domSlots < 3) return false;

  pushTrace("PRESENTATION_OWNERSHIP_TRANSFER_STARTED", {
    readiness: finalReadiness,
    note: `navSeq=${tx.navSeq}|reason=${reason}`,
  });
  ownershipTransferCount += 1;
  runtime.presentationOwner = "final_route";
  syncPresentationOwnerFromState(runtime);
  pushTrace("PRESENTATION_OWNERSHIP_TRANSFERRED", {
    readiness: finalReadiness,
    note: `navSeq=${tx.navSeq}|finalDom=${finalReadiness.finalSurfaceDomSlots}`,
  });

  cancelPostSettleBridgeObservation();
  clearSlideAnimationDomState();
  // Do not freeze here: freezing + dropping bridge CSS before legacy activate
  // briefly re-shows the source main tab (post-arrival second paint).
  releasePresentedShuffleOwnerSurface({ freeze: false });

  if (runtime.latchArmedAtMono !== null) {
    latchLifetimeSamplesMs.push(monoMs() - runtime.latchArmedAtMono);
    runtime.latchArmedAtMono = null;
  }
  if (reason === "final-route-ready") latchReleasesByFinalRoute += 1;
  else latchReleasesByFailsafe += 1;

  settleShuffleDestinationWarmIntent();
  const releasedSeq = runtime.presentationLatchNavSeq;
  releasePresentationLatch();
  pushTrace("PRESENTATION_LATCH_RELEASED", {
    note: `navSeq=${releasedSeq ?? "none"}|reason=${reason}|finalDom=${finalReadiness.finalSurfaceDomSlots}`,
    readiness: finalReadiness,
  });

  runtime.bridgeCompletedAtMono = monoMs();
  if (runtime.bridgeStartedAtMono !== null) {
    bridgeLifetimeSamplesMs.push(runtime.bridgeCompletedAtMono - runtime.bridgeStartedAtMono);
  }
  bridgeCompleteCount += 1;
  runtime.postSettleBridgeActive = false;
  runtime.postSettleBridgeTransactionId = null;
  runtime.bridgeStartedAtMono = null;
  runtime.bridgeObserverOwnerModuleId = null;
  pushTrace("POST_SETTLE_ROUTE_BRIDGE_COMPLETED", {
    readiness: finalReadiness,
    note: `navSeq=${releasedSeq ?? "none"}|reason=${reason}`,
  });

  // Clear ownership first so activate/present are not blocked, while bridge CSS
  // still keeps the host presentable for this synchronous turn.
  clearTransactionRef("completeFinalShufflePresentationHandoff", reason);
  activateShuffleTabSurface({ microSlideSettle: true });

  // Drop bridge CSS only after the host is presented AND surface-active.
  // Sync-only drop raced a paint where the source main-tab keepalive flashed
  // (manual Chats→Shuffle pantallazo post-771a927).
  if (typeof document !== "undefined") {
    const dropBridgeWhenPresented = () => {
      const host = document.getElementById("sayittome-shuffle-keepalive-host");
      const presentedVisible =
        !!host &&
        host.classList.contains("sayittome-shuffle-keepalive-visible") &&
        !host.classList.contains("sayittome-shuffle-keepalive-frozen") &&
        document.body.classList.contains("sayittome-shuffle-surface-active");
      if (presentedVisible) {
        document.documentElement.removeAttribute("data-post-settle-route-bridge");
        return true;
      }
      return false;
    };
    if (!dropBridgeWhenPresented()) {
      requestAnimationFrame(() => {
        if (!dropBridgeWhenPresented()) {
          requestAnimationFrame(() => {
            dropBridgeWhenPresented();
          });
        }
      });
    }
  }
  notify();
  return true;
}

function handlePostSettleBridgeFailsafe() {
  const runtime = rt();
  const tx = runtime.activeTx;
  if (!tx || !runtime.postSettleBridgeActive || tx.phase !== "route_bridge") return;
  if (!isCurrentBridgeObserverOwner()) return;

  bridgeFailsafeCount += 1;
  const prepReadiness = getShuffleDestinationReadiness();
  const finalReadiness = getFinalShuffleRoutePresentationReadiness();
  const pathname = pathnameNow();

  pushTrace("FINAL_ROUTE_HANDOFF_FAILSAFE", {
    readiness: finalReadiness,
    note: `pathname=${pathname}|prepDom=${prepReadiness.domSlots}|finalDom=${finalReadiness.finalSurfaceDomSlots}`,
  });

  if (
    pathname === "/shuffle" &&
    prepReadiness.domSlots >= 3 &&
    prepReadiness.loadingShellCount === 0
  ) {
    const recovered: FinalShuffleRoutePresentationReadiness = {
      ...finalReadiness,
      ready: true,
      finalSurfaceDomSlots: prepReadiness.domSlots,
      finalSurfaceVisibleSlots: prepReadiness.visibleSlots,
      domSlots: prepReadiness.domSlots,
      visibleSlots: prepReadiness.visibleSlots,
      finalSurfaceLoadingShellVisible: false,
      loadingShellCount: 0,
      finalSurfaceMounted: true,
      finalSurfaceVisible: true,
    };
    pushTrace("FINAL_ROUTE_SURFACE_READY", { readiness: recovered, note: "failsafe-recovery" });
    if (completeFinalShufflePresentationHandoff("failsafe-recovery", recovered)) {
      return;
    }
  }

  runtime.bridgeFailsafeTimer = setTimeout(
    handlePostSettleBridgeFailsafe,
    POST_SETTLE_BRIDGE_FAILSAFE_RETRY_MS,
  );
}

function resumePostSettleRouteBridgeObservation(transactionId: string, bridgeGeneration: number) {
  const runtime = rt();
  cancelPostSettleBridgeObservation();

  let sampleFrames = 0;
  const tick = () => {
    const currentRuntime = rt();
    if (!isCurrentBridgeObserverOwner()) {
      if (isMainTabShuffleLifecycleDiagEnabled()) {
        emitLifecycleDiag({
          kind: "POST_SETTLE_ROUTE_BRIDGE_OBSERVER_STALE_EXIT",
          transactionId,
          moduleInstanceId: TRANSITION_MODULE_INSTANCE_ID,
          note: `bridgeGeneration=${bridgeGeneration}|owner=${currentRuntime.bridgeObserverOwnerModuleId ?? "none"}`,
        });
      }
      currentRuntime.bridgeRaf = null;
      return;
    }

    const currentTx = currentRuntime.activeTx;
    if (
      !currentTx ||
      currentTx.transactionId !== transactionId ||
      !currentRuntime.postSettleBridgeActive ||
      currentTx.phase !== "route_bridge" ||
      currentRuntime.bridgeGeneration !== bridgeGeneration
    ) {
      currentRuntime.bridgeRaf = null;
      return;
    }

    const prepReadiness = getShuffleDestinationReadiness();
    const finalReadiness = getFinalShuffleRoutePresentationReadiness();
    sampleFrames += 1;

    if (sampleFrames === 1 || sampleFrames % 4 === 0) {
      bridgeReadinessSampleCount += 1;
      pushTrace("FINAL_ROUTE_READINESS_SAMPLE", {
        readiness: finalReadiness,
        note: `pathname=${pathnameNow()}|prepDom=${prepReadiness.domSlots}`,
      });
    }

    if (observeFinalShuffleRoutePresentationReadinessStable()) {
      if (currentRuntime.bridgeStartedAtMono !== null) {
        finalRouteReadinessWaitSamplesMs.push(monoMs() - currentRuntime.bridgeStartedAtMono);
      }
      pushTrace("FINAL_ROUTE_SURFACE_READY", { readiness: finalReadiness });
      if (completeFinalShufflePresentationHandoff("final-route-ready", finalReadiness)) {
        currentRuntime.bridgeRaf = null;
        return;
      }
    }

    currentRuntime.bridgeRaf = requestAnimationFrame(tick);
  };

  runtime.bridgeRaf = requestAnimationFrame(tick);
}

function startPostSettleRouteBridge() {
  const runtime = rt();
  const tx = runtime.activeTx;
  if (!tx) return;

  cancelScheduledPresentationLatchRelease();
  resetFinalShuffleRoutePresentationReadinessStability();

  runtime.bridgeGeneration += 1;
  runtime.bridgeObserverOwnerModuleId = TRANSITION_MODULE_INSTANCE_ID;
  runtime.postSettleBridgeTransactionId = tx.transactionId;
  runtime.postSettleBridgeActive = true;
  runtime.bridgeStartedAtMono = monoMs();
  bridgeStartCount += 1;
  tx.phase = "route_bridge";
  syncPresentationOwnerFromState(runtime);

  if (typeof document !== "undefined") {
    keepPresentedShuffleSurfaceForRouteBridge();
  }
  pushTrace("POST_SETTLE_ROUTE_BRIDGE_STARTED", {
    readiness: getShuffleDestinationReadiness(),
    note: `navSeq=${tx.navSeq}|prepDom=${getShuffleDestinationReadiness().domSlots}`,
  });
  notify();

  runtime.bridgeFailsafeTimer = setTimeout(
    handlePostSettleBridgeFailsafe,
    POST_SETTLE_BRIDGE_FAILSAFE_MS,
  );

  resumePostSettleRouteBridgeObservation(tx.transactionId, runtime.bridgeGeneration);
}

function adoptCanonicalPresentationOnModuleEval(moduleInstanceId: string) {
  const runtime = rt();
  maybeRecoverStaleCanonicalRuntime();
  notePresentationRuntimeReusedForDiag();

  const pin = getSoftCommitTxPin();
  if (pin && (pin.isSoftCommitInFlight || pin.phase === "preparing" || pin.phase === "armed")) {
    const previousModule = pin.moduleInstanceIdOriginal;
    const previousRuntime = pin.runtimeInstanceIdOriginal;
    const moduleChanged = previousModule != null && previousModule !== moduleInstanceId;
    const runtimeChanged =
      previousRuntime != null && previousRuntime !== runtime.runtimeInstanceId;
    if ((moduleChanged || runtimeChanged || !runtime.activeTx) && pin.isSoftCommitInFlight) {
      noteSoftCommitRuntimeReinitAfterSoftPush({
        moduleInstanceId,
        runtimeInstanceId: runtime.runtimeInstanceId,
        previousModuleInstanceId: previousModule,
        previousRuntimeInstanceId: previousRuntime,
      });
      if (!runtime.activeTx || runtime.activeTx.transactionId !== pin.txId) {
        rehydrateSoftCommitPinnedTxAfterModuleReinit(moduleInstanceId);
      }
    } else if (!runtime.activeTx) {
      rehydrateSoftCommitPinnedTxAfterModuleReinit(moduleInstanceId);
    }
  }

  const tx = runtime.activeTx;
  if (!tx || !ownsCanonicalPresentationPhase(tx.phase)) return;

  if (isMainTabShuffleLifecycleDiagEnabled()) {
    emitLifecycleDiag({
      kind: "TRANSITION_MODULE_ADOPTED_ACTIVE_TRANSACTION",
      moduleInstanceId,
      transactionId: tx.transactionId,
      phase: tx.phase,
      navSeq: tx.navSeq,
      presentationLatchActive: runtime.presentationLatchNavSeq !== null,
      postSettleBridgeActive: runtime.postSettleBridgeActive,
      note: `runtimeInstanceId=${runtime.runtimeInstanceId}|bridgeGeneration=${runtime.bridgeGeneration}|previousBridgeObserver=${runtime.bridgeObserverOwnerModuleId ?? "none"}`,
    });
  }

  if (tx.phase === "route_bridge" && runtime.postSettleBridgeActive) {
    const previousOwner = runtime.bridgeObserverOwnerModuleId;
    runtime.bridgeObserverOwnerModuleId = moduleInstanceId;
    if (isMainTabShuffleLifecycleDiagEnabled()) {
      emitLifecycleDiag({
        kind: "POST_SETTLE_ROUTE_BRIDGE_OBSERVER_ADOPTED",
        moduleInstanceId,
        transactionId: tx.transactionId,
        pathname: pathnameNow(),
        note: `previousModuleInstanceId=${previousOwner ?? "none"}|bridgeGeneration=${runtime.bridgeGeneration}|runtimeInstanceId=${runtime.runtimeInstanceId}`,
      });
    }
    if (runtime.postSettleBridgeTransactionId) {
      resumePostSettleRouteBridgeObservation(
        runtime.postSettleBridgeTransactionId,
        runtime.bridgeGeneration,
      );
    }
  }

  syncPresentationOwnerFromState(runtime);
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export function exportPresentationLatchMetrics() {
  const runtime = rt();
  const lifetimes = [...latchLifetimeSamplesMs].sort((a, b) => a - b);
  return {
    latchAcquisitions,
    latchReleasesByFinalRoute,
    latchReleasesByFailsafe,
    latchLifetimeMsP50: percentile(lifetimes, 0.5),
    latchLifetimeMsP95: percentile(lifetimes, 0.95),
    latchLifetimeMsMax: lifetimes.length ? lifetimes[lifetimes.length - 1] : null,
    latchLifetimeSamples: lifetimes.length,
    latchArmedAtMono: runtime.latchArmedAtMono,
  };
}

export function resetPresentationLatchMetrics() {
  latchAcquisitions = 0;
  latchReleasesByFinalRoute = 0;
  latchReleasesByFailsafe = 0;
  latchLifetimeSamplesMs.length = 0;
  rt().latchArmedAtMono = null;
}

export function getMainTabToShufflePresentationLatchNavSeq() {
  return rt().presentationLatchNavSeq;
}

export function isMainTabToShufflePresentationLatchActive() {
  return rt().presentationLatchNavSeq !== null;
}

export function isPostSettleRouteBridgeActive() {
  return rt().postSettleBridgeActive;
}

export function getActiveSlideFailsafeTimerIdForDiag() {
  const runtime = rt();
  return (
    runtime.slideEndWatchdogId ??
    runtime.slidePreWriteWatchdogId ??
    runtime.activeSlideFailsafeTimerId
  );
}

export function getTransitionModuleInstanceIdForDiag() {
  return TRANSITION_MODULE_INSTANCE_ID;
}

function normalizeShuffleHostAfterSlideSettle() {
  if (typeof document === "undefined") return;
  const runtime = rt();
  const tx = runtime.activeTx;
  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!(shuffleHost instanceof HTMLElement)) return;
  traceSlideDomWrite(
    {
      writerId: "SETTLE_NORMALIZE_HOST_TRANSFORM",
      caller: "normalizeShuffleHostAfterSlideSettle",
      transactionId: tx?.transactionId ?? null,
      phase: tx?.phase ?? "idle",
      navSeq: tx?.navSeq ?? runtime.navSeq,
      nodeRole: "destination",
      nodeInstanceId: observeHostElement(shuffleHost),
      property: "transform",
      intendedValue: "none",
    },
    shuffleHost,
    (el) => {
      el.style.transform = "none";
    },
  );
  traceSlideDomWrite(
    {
      writerId: "SETTLE_NORMALIZE_HOST_TRANSITION",
      caller: "normalizeShuffleHostAfterSlideSettle",
      transactionId: tx?.transactionId ?? null,
      phase: tx?.phase ?? "idle",
      navSeq: tx?.navSeq ?? runtime.navSeq,
      nodeRole: "destination",
      nodeInstanceId: observeHostElement(shuffleHost),
      property: "transition",
      intendedValue: "none",
    },
    shuffleHost,
    (el) => {
      el.style.transition = "none";
    },
  );
  shuffleHost.style.removeProperty("will-change");
}

function clearSlideAnimationDomState(options?: { removeSlideShuffleActive?: boolean }) {
  if (typeof document === "undefined") return;
  const runtime = rt();
  if (runtime.activeTx) {
    pushTrace("TRANSACTION_CLEANUP_STARTED");
  }
  const html = document.documentElement;
  html.removeAttribute("data-main-tab-shuffle-slide");
  html.removeAttribute("data-main-tab-shuffle-motor");
  html.removeAttribute("data-main-tab-shuffle-direction");
  html.removeAttribute("data-main-tab-shuffle-source");
  html.removeAttribute("data-main-tab-shuffle-nav-seq");
  for (const el of document.querySelectorAll(".sayittome-slide-source-active")) {
    el.classList.remove("sayittome-slide-source-active");
    if (el instanceof HTMLElement) {
      traceSlideDomWrite(
        {
          writerId: "SLIDE_CLEANUP_SOURCE_TRANSFORM",
          caller: "clearSlideAnimationDomState",
          transactionId: runtime.activeTx?.transactionId ?? null,
          phase: runtime.activeTx?.phase ?? "idle",
          navSeq: runtime.activeTx?.navSeq ?? runtime.navSeq,
          nodeRole: "source",
          nodeInstanceId: observeHostElement(el),
          property: "transform",
          intendedValue: null,
        },
        el,
        (target) => {
          target.style.removeProperty("transition");
          target.style.removeProperty("transform");
          target.style.removeProperty("will-change");
        },
      );
    }
  }
  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  if (options?.removeSlideShuffleActive) {
    shuffleHost?.classList.remove("sayittome-slide-shuffle-active");
  }
  if (shuffleHost instanceof HTMLElement) {
    traceSlideDomWrite(
      {
        writerId: "SLIDE_CLEANUP_DEST_TRANSFORM",
        caller: "clearSlideAnimationDomState",
        transactionId: runtime.activeTx?.transactionId ?? null,
        phase: runtime.activeTx?.phase ?? "idle",
        navSeq: runtime.activeTx?.navSeq ?? runtime.navSeq,
        nodeRole: "destination",
        nodeInstanceId: observeHostElement(shuffleHost),
        property: "transform",
        intendedValue: "none",
      },
      shuffleHost,
      (el) => {
        el.style.transform = "none";
      },
    );
    traceSlideDomWrite(
      {
        writerId: "SLIDE_CLEANUP_DEST_TRANSITION",
        caller: "clearSlideAnimationDomState",
        transactionId: runtime.activeTx?.transactionId ?? null,
        phase: runtime.activeTx?.phase ?? "idle",
        navSeq: runtime.activeTx?.navSeq ?? runtime.navSeq,
        nodeRole: "destination",
        nodeInstanceId: observeHostElement(shuffleHost),
        property: "transition",
        intendedValue: "none",
      },
      shuffleHost,
      (el) => {
        el.style.transition = "none";
      },
    );
    shuffleHost.style.removeProperty("will-change");
  }
  if (runtime.activeTx) {
    pushTrace("TRANSACTION_CLEANUP_COMPLETED");
  }
}

function clearSlideDomState() {
  clearSlideAnimationDomState({ removeSlideShuffleActive: true });
  releasePresentedShuffleOwnerSurface();
}

function applyPreparingDomState(source: MainTabShuffleSource) {
  if (typeof document === "undefined") return;
  const runtime = rt();
  const html = document.documentElement;
  html.setAttribute("data-main-tab-shuffle-slide", "preparing");
  html.setAttribute("data-main-tab-shuffle-direction", directionForSource(source));
  html.setAttribute("data-main-tab-shuffle-source", source);
  html.setAttribute("data-main-tab-shuffle-nav-seq", String(runtime.activeTx?.navSeq ?? runtime.navSeq));
  const sourceEl = document.getElementById(sourceHostId(source));
  sourceEl?.classList.add("sayittome-slide-source-active");
}

function applyArmedDomState() {
  const runtime = rt();
  const tx = runtime.activeTx;
  if (typeof document === "undefined" || !tx) return;
  const html = document.documentElement;
  html.setAttribute("data-main-tab-shuffle-slide", "armed");
  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  shuffleHost?.classList.add("sayittome-slide-shuffle-active");
  const sourceEl = document.getElementById(sourceHostId(tx.source));
  sourceEl?.classList.add("sayittome-slide-source-active");

  noteShuffleHostObserved(shuffleHost, "applyArmedDomState");
  pushTrace("STAGE_INITIAL_POSITIONS_APPLIED", {
    note: `host=${observeHostElement(shuffleHost) ?? "none"}`,
  });

  const dir = tx.direction;
  const destInitial =
    dir === "from-right" ? "translate3d(100%, 0, 0)" : "translate3d(-100%, 0, 0)";
  if (shuffleHost instanceof HTMLElement) {
    shuffleHost.style.willChange = "transform";
    traceSlideDomWrite(
      {
        writerId: "ARMED_INITIAL_DESTINATION",
        caller: "applyArmedDomState",
        transactionId: tx.transactionId,
        phase: tx.phase,
        navSeq: tx.navSeq,
        nodeRole: "destination",
        nodeInstanceId: observeHostElement(shuffleHost),
        property: "transform",
        intendedValue: destInitial,
      },
      shuffleHost,
      (el) => {
        el.style.transform = destInitial;
      },
    );
  }
  if (sourceEl instanceof HTMLElement) {
    sourceEl.style.willChange = "transform";
    traceSlideDomWrite(
      {
        writerId: "ARMED_INITIAL_SOURCE",
        caller: "applyArmedDomState",
        transactionId: tx.transactionId,
        phase: tx.phase,
        navSeq: tx.navSeq,
        nodeRole: "source",
        nodeInstanceId: observeHostElement(sourceEl),
        property: "transform",
        intendedValue: "translate3d(0, 0, 0)",
      },
      sourceEl,
      (el) => {
        el.style.transform = "translate3d(0, 0, 0)";
      },
    );
  }
}

function waapiAnimationEffectivelyDone(anim: Animation | null | undefined) {
  if (!anim) return false;
  if (anim.playState === "finished") return true;
  const ct = anim.currentTime;
  return typeof ct === "number" && ct >= MAIN_TAB_TO_SHUFFLE_SLIDE_MS - 1;
}

function detachActiveWaapiCancelHandlers(destAnim: Animation, sourceAnim: Animation) {
  for (const handler of activeWaapiCancelHandlers) {
    try {
      destAnim.removeEventListener("cancel", handler);
      sourceAnim.removeEventListener("cancel", handler);
    } catch {
      /* ignore */
    }
  }
  activeWaapiCancelHandlers = [];
}

function commitWaapiFinishAndSettle(args: {
  destAnim: Animation;
  sourceAnim: Animation;
  shuffleHost: HTMLElement;
  sourceEl: HTMLElement;
  pairs: ReturnType<typeof waapiKeyframePair>;
  baseFields: () => Record<string, unknown>;
  animationIds: string[];
  onCancel: (ev: Event) => void;
  scheduledTransactionId: string;
  setFinished: (v: boolean) => void;
  setCancelled: (v: boolean) => void;
  promotedByWatchdog?: boolean;
  promoteReason?: string | null;
  watchdogReason?: string | null;
}) {
  const {
    destAnim,
    sourceAnim,
    shuffleHost,
    sourceEl,
    pairs,
    baseFields,
    animationIds,
    onCancel,
    scheduledTransactionId,
    setFinished,
    promotedByWatchdog = false,
    promoteReason = null,
    watchdogReason = null,
  } = args;
  const live = rt().activeTx;
  if (!live || live.transactionId !== scheduledTransactionId || live.phase !== "sliding") {
    return;
  }

  const priorTerminal = waapiTerminalState;
  setFinished(true);
  // Mark physical before fill-release cancel so late cancel events are cleanup, not failure.
  waapiCanonicalPhysicalSatisfied = true;
  detachActiveWaapiCancelHandlers(destAnim, sourceAnim);
  try {
    destAnim.removeEventListener("cancel", onCancel);
    sourceAnim.removeEventListener("cancel", onCancel);
  } catch {
    /* ignore */
  }

  const finishReason = promotedByWatchdog
    ? promoteReason || "promoted-from-end-watchdog-after-duration"
    : "native-finished";
  const settleReason = promotedByWatchdog
    ? "waapi-watchdog-promoted-finish"
    : "waapi-finish";

  emitArmingDiag({
    kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED",
    ...baseFields(),
    monoMs: monoMs(),
    phase: live.phase,
    navSeq: live.navSeq,
    playState: destAnim.playState,
    readyResolved: true,
    finishedResolved: true,
    animationIds,
    reason: finishReason,
    promotedByWatchdog,
  });
  if (promotedByWatchdog) {
    emitArmingDiag({
      kind: "MICRO_SLIDE_WAAPI_FINISHED_PROMOTED_BY_WATCHDOG",
      ...baseFields(),
      monoMs: monoMs(),
      phase: live.phase,
      navSeq: live.navSeq,
      animationIds,
      promoteReason: finishReason,
      watchdogReason,
      terminalState: "finished-promoted",
      priorTerminalState: priorTerminal,
      physicalSatisfiedBeforeEvent: false,
      physicalSatisfiedAfterEvent: true,
      finalStylesCommitted: false,
      fillReleaseStarted: false,
      duration: MAIN_TAB_TO_SHUFFLE_SLIDE_MS,
      easing: MAIN_TAB_TO_SHUFFLE_SLIDE_EASING,
      commitMode: "history",
    });
  }

  emitWaapiTerminalReduced({
    prior: priorTerminal,
    next: promotedByWatchdog ? "finished-promoted" : "finished-native",
    baseFields,
    animationIds,
    promoteReason: finishReason,
    watchdogReason,
  });

  traceSlideDomWrite(
    {
      writerId: "WAAPI_FINAL_DESTINATION",
      caller: "commitWaapiFinishAndSettle",
      transactionId: live.transactionId,
      phase: live.phase,
      navSeq: live.navSeq,
      nodeRole: "destination",
      nodeInstanceId: observeHostElement(shuffleHost),
      property: "transform",
      intendedValue: pairs.destination[1],
    },
    shuffleHost,
    (el) => {
      el.style.transform = pairs.destination[1];
    },
  );
  traceSlideDomWrite(
    {
      writerId: "WAAPI_FINAL_SOURCE",
      caller: "commitWaapiFinishAndSettle",
      transactionId: live.transactionId,
      phase: live.phase,
      navSeq: live.navSeq,
      nodeRole: "source",
      nodeInstanceId: observeHostElement(sourceEl),
      property: "transform",
      intendedValue: pairs.source[1],
    },
    sourceEl,
    (el) => {
      el.style.transform = pairs.source[1];
    },
  );

  waapiFillReleaseStarted = true;
  emitArmingDiag({
    kind: "MICRO_SLIDE_WAAPI_FILL_RELEASE_STARTED",
    ...baseFields(),
    monoMs: monoMs(),
    phase: live.phase,
    navSeq: live.navSeq,
    animationIds,
    terminalState: waapiTerminalState,
    priorTerminalState: priorTerminal,
    physicalSatisfiedBeforeEvent: true,
    physicalSatisfiedAfterEvent: true,
    finalStylesCommitted: true,
    fillReleaseStarted: true,
    duration: MAIN_TAB_TO_SHUFFLE_SLIDE_MS,
    easing: MAIN_TAB_TO_SHUFFLE_SLIDE_EASING,
    commitMode: "history",
  });

  try {
    destAnim.cancel();
  } catch {
    /* ignore */
  }
  try {
    sourceAnim.cancel();
  } catch {
    /* ignore */
  }
  activeWaapiAnimations = [];
  activeWaapiTxId = null;

  emitArmingDiag({
    kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED",
    ...baseFields(),
    monoMs: monoMs(),
    phase: live.phase,
    navSeq: live.navSeq,
    finishedResolved: true,
    animationIds,
    reason: "inline-transform-after-finish",
  });
  emitArmingDiag({
    kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED",
    ...baseFields(),
    monoMs: monoMs(),
    phase: live.phase,
    navSeq: live.navSeq,
    readyResolved: true,
    finishedResolved: true,
    playState: "finished",
    animationIds,
    reason: "waapi-ready-and-finished",
  });
  emitArmingDiag({
    kind: "MICRO_SLIDE_WAAPI_PHYSICAL_SATISFIED_CANONICAL",
    ...baseFields(),
    monoMs: monoMs(),
    phase: live.phase,
    navSeq: live.navSeq,
    animationIds,
    terminalState: "physical-satisfied",
    priorTerminalState: waapiTerminalState,
    physicalSatisfiedBeforeEvent: true,
    physicalSatisfiedAfterEvent: true,
    finalStylesCommitted: true,
    fillReleaseStarted: waapiFillReleaseStarted,
    promoteReason: finishReason,
    watchdogReason,
    duration: MAIN_TAB_TO_SHUFFLE_SLIDE_MS,
    easing: MAIN_TAB_TO_SHUFFLE_SLIDE_EASING,
    commitMode: "history",
  });
  emitWaapiTerminalReduced({
    prior: waapiTerminalState,
    next: "physical-satisfied",
    baseFields,
    animationIds,
    promoteReason: finishReason,
    watchdogReason,
  });
  emitArmingDiag({
    kind: "MICRO_SLIDE_WAAPI_CLEANUP_DONE",
    ...baseFields(),
    monoMs: monoMs(),
    phase: live.phase,
    navSeq: live.navSeq,
    reason: "after-finish-commit",
    animationIds,
  });

  pushTrace("TRANSITION_END", { note: settleReason });
  emitSettleInitiated({
    caller: "commitWaapiFinishAndSettle",
    reason: settleReason,
    transactionId: live.transactionId,
    phase: live.phase,
    navSeq: live.navSeq,
  });
  finishSlideSettled(settleReason);
}

function startWaapiCompositorSlideAnimation() {
  const runtime = rt();
  const tx = runtime.activeTx;
  if (!tx || typeof document === "undefined") return;
  resetWaapiCanonicalSettleState();

  const html = document.documentElement;
  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  const sourceEl = document.getElementById(sourceHostId(tx.source));
  const stageEl = document.querySelector("[data-main-tab-shuffle-stage]");
  const callSequence = nextStartSlideAnimationCallSequence();
  const pairs = waapiKeyframePair(tx.direction);
  const duration = MAIN_TAB_TO_SHUFFLE_SLIDE_MS;
  const easing = MAIN_TAB_TO_SHUFFLE_SLIDE_EASING;
  const commitMode = "history";
  const sourceHostNodeId = observeHostElement(sourceEl);
  const destHostNodeId = observeHostElement(shuffleHost);
  const moduleInstanceId = getTransitionModuleInstanceId();
  const runtimeInstanceId = runtime.runtimeInstanceId;
  const ringIdentity = getTraceRingIdentity();
  const traceRingId = ringIdentity?.traceRingInstanceId ?? null;
  const scheduledTransactionId = tx.transactionId;

  const baseFields = () =>
    ({
      transactionId: scheduledTransactionId,
      txId: scheduledTransactionId,
      sourceTab: tx.source,
      commitMode,
      sourceHostId: sourceHostNodeId,
      destHostId: destHostNodeId,
      sourceKeyframes: pairs.source,
      destKeyframes: pairs.destination,
      duration,
      easing,
      moduleInstanceId,
      runtimeInstanceId,
      traceRingId,
      transitionModuleInstanceId: moduleInstanceId,
    }) as Record<string, unknown>;

  emitStartSlideAnimationEntered({
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
    callSequence,
    hostInstanceId: destHostNodeId,
    stageInstanceId: observeStageElement(stageEl),
    sourceNodeId: sourceHostNodeId,
    destinationNodeId: destHostNodeId,
    datasetSlideState: html.getAttribute("data-main-tab-shuffle-slide"),
  });

  tx.phase = "sliding";
  touchSoftCommitTxPin("sliding");
  tx.slideStartedAtMono = monoMs();
  syncPresentationOwnerFromState(runtime);
  notify();
  pushTrace("PHASE_SLIDING");
  html.setAttribute("data-main-tab-shuffle-slide", "running");
  html.setAttribute("data-main-tab-shuffle-motor", "waapi");

  emitArmingDiag({
    kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED",
    ...baseFields(),
    monoMs: monoMs(),
    phase: tx.phase,
    navSeq: tx.navSeq,
    reason: "native-shell-history-micro-slide",
  });

  const animateAvailable =
    typeof Element !== "undefined" &&
    typeof (Element.prototype as Element & { animate?: unknown }).animate === "function";

  if (!animateAvailable) {
    emitArmingDiag({
      kind: "MICRO_SLIDE_WAAPI_UNAVAILABLE_FALLBACK",
      ...baseFields(),
      monoMs: monoMs(),
      phase: tx.phase,
      navSeq: tx.navSeq,
      reason: "element.animate-unavailable",
      playState: null,
      readyResolved: false,
      finishedResolved: false,
    });
    // Do not silently fall back to CSS for clean classification.
    emitSettleInitiated({
      caller: "startWaapiCompositorSlideAnimation",
      reason: "waapi-unavailable",
      transactionId: tx.transactionId,
      phase: tx.phase,
      navSeq: tx.navSeq,
    });
    finishSlideSettled("waapi-unavailable");
    emitStartSlideAnimationReturned({
      transactionId: tx.transactionId,
      phase: tx.phase,
      navSeq: tx.navSeq,
      callSequence,
      hostInstanceId: destHostNodeId,
      stageInstanceId: observeStageElement(stageEl),
      sourceNodeId: sourceHostNodeId,
      destinationNodeId: destHostNodeId,
      datasetSlideState: html.getAttribute("data-main-tab-shuffle-slide"),
    });
    return;
  }

  emitArmingDiag({
    kind: "MICRO_SLIDE_WAAPI_KEYFRAMES_PREPARED",
    ...baseFields(),
    monoMs: monoMs(),
    phase: tx.phase,
    navSeq: tx.navSeq,
    reason: "keyframes-match-css-directions",
  });

  runtime.slideFinalWriteCommittedMono = null;
  runtime.sourceTransitionStartedMono = null;
  runtime.destinationTransitionStartedMono = null;
  runtime.slideTransitionStartedMono = null;
  armPreWriteWatchdog(tx);

  // WAAPI element.animate() is the compositor write. Do not inherit the CSS
  // 2×rAF precommit barrier — under main-thread load (e.g. visual screencast)
  // that barrier can miss PRE_WRITE_WATCHDOG_DELAY_MS and settle
  // final-write-never-committed before animate() runs. CSS path keeps the barrier.
  const armingFrameCount = 0;
  let barrierFrameIndex = 0;
  const armingStartedMono = monoMs();

  emitArmingDiag({
    kind: "MICRO_SLIDE_WAAPI_PRECOMMIT_BARRIER_BYPASSED",
    ...baseFields(),
    monoMs: monoMs(),
    phase: tx.phase,
    navSeq: tx.navSeq,
    reason: "compositor-animate-is-the-write",
    armingFrameCount,
    cssPrecommitBarrierFrames: MAIN_TAB_SHUFFLE_TRANSITION_PRECOMMIT_BARRIER_FRAMES,
  });

  const runWaapiAfterBarrier = (rafCallbackTimestamp: number) => {
    void rafCallbackTimestamp;
    const currentRuntime = rt();
    const current = currentRuntime.activeTx;
    barrierFrameIndex += 1;
    const frameIndex = barrierFrameIndex;

    if (
      !current ||
      current.transactionId !== scheduledTransactionId ||
      current.phase !== "sliding" ||
      moduleInstanceId !== getTransitionModuleInstanceId()
    ) {
      emitArmingDiag({
        kind: "MICRO_SLIDE_WAAPI_STALE_TX_ABORT",
        ...baseFields(),
        monoMs: monoMs(),
        phase: current?.phase ?? "idle",
        navSeq: current?.navSeq ?? tx.navSeq,
        reason: !current
          ? "no-active-tx"
          : current.transactionId !== scheduledTransactionId
            ? "tx-mismatch"
            : current.phase !== "sliding"
              ? "phase-not-sliding"
              : "module-reinit",
        frameIndex,
        armingLatencyMs: monoMs() - armingStartedMono,
      });
      cancelActiveWaapiAnimations("stale-tx-during-waapi-arming");
      return;
    }

    if (frameIndex < armingFrameCount) {
      currentRuntime.diagFinalWriteRafHandle = requestAnimationFrame(runWaapiAfterBarrier);
      return;
    }

    if (!(shuffleHost instanceof HTMLElement) || !(sourceEl instanceof HTMLElement)) {
      emitArmingDiag({
        kind: "MICRO_SLIDE_WAAPI_ANIMATION_REJECTED",
        ...baseFields(),
        monoMs: monoMs(),
        phase: current.phase,
        navSeq: current.navSeq,
        reason: "hosts-missing",
      });
      finishSlideSettled("waapi-hosts-missing");
      return;
    }

    // Ensure initial transforms match armed state before WAAPI (no layout reads).
    shuffleHost.style.transition = "none";
    sourceEl.style.transition = "none";
    shuffleHost.style.transform = pairs.destination[0];
    sourceEl.style.transform = pairs.source[0];

    const timing: KeyframeAnimationOptions = {
      duration,
      easing,
      fill: "forwards",
      composite: "replace",
    };

    let destAnim: Animation;
    let sourceAnim: Animation;
    try {
      destAnim = shuffleHost.animate(
        [{ transform: pairs.destination[0] }, { transform: pairs.destination[1] }],
        timing,
      );
      sourceAnim = sourceEl.animate(
        [{ transform: pairs.source[0] }, { transform: pairs.source[1] }],
        timing,
      );
    } catch (err) {
      emitArmingDiag({
        kind: "MICRO_SLIDE_WAAPI_ANIMATION_REJECTED",
        ...baseFields(),
        monoMs: monoMs(),
        phase: current.phase,
        navSeq: current.navSeq,
        reason: err instanceof Error ? err.message : "animate-threw",
      });
      finishSlideSettled("waapi-animate-rejected");
      return;
    }

    activeWaapiAnimations = [destAnim, sourceAnim];
    activeWaapiTxId = scheduledTransactionId;
    const animationIds = [destAnim.id || "dest", sourceAnim.id || "source"];

    emitArmingDiag({
      kind: "MICRO_SLIDE_WAAPI_ANIMATION_CREATED",
      ...baseFields(),
      monoMs: monoMs(),
      phase: current.phase,
      navSeq: current.navSeq,
      playState: destAnim.playState,
      animationIds,
      readyResolved: false,
      finishedResolved: false,
    });

    // Feed existing watchdog hooks without changing watchdog semantics.
    // Anchor start immediately when playState is already running so the
    // post-write pre-start watchdog (190ms) cannot preempt a delayed ready().
    noteSlideFinalWriteCommitted(current);
    if (destAnim.playState === "running" || destAnim.playState === "finished") {
      emitArmingDiag({
        kind: "MICRO_SLIDE_WAAPI_ANIMATION_READY",
        ...baseFields(),
        monoMs: monoMs(),
        phase: current.phase,
        navSeq: current.navSeq,
        playState: destAnim.playState,
        readyResolved: true,
        animationIds,
        nodeRole: "destination",
        reason: "playstate-at-create",
      });
      emitArmingDiag({
        kind: "MICRO_SLIDE_WAAPI_ANIMATION_STARTED",
        ...baseFields(),
        monoMs: monoMs(),
        phase: current.phase,
        navSeq: current.navSeq,
        playState: destAnim.playState,
        readyResolved: true,
        animationIds,
        nodeRole: "destination",
        reason: "playstate-at-create",
      });
      noteNativeTransitionRun(current, "destination", "transform");
      noteNativeTransitionStart(current, "destination", monoMs(), "transform");
    }
    if (sourceAnim.playState === "running" || sourceAnim.playState === "finished") {
      emitArmingDiag({
        kind: "MICRO_SLIDE_WAAPI_ANIMATION_READY",
        ...baseFields(),
        monoMs: monoMs(),
        phase: current.phase,
        navSeq: current.navSeq,
        playState: sourceAnim.playState,
        readyResolved: true,
        animationIds,
        nodeRole: "source",
        reason: "playstate-at-create",
      });
      emitArmingDiag({
        kind: "MICRO_SLIDE_WAAPI_ANIMATION_STARTED",
        ...baseFields(),
        monoMs: monoMs(),
        phase: current.phase,
        navSeq: current.navSeq,
        playState: sourceAnim.playState,
        readyResolved: true,
        animationIds,
        nodeRole: "source",
        reason: "playstate-at-create",
      });
      noteNativeTransitionRun(current, "source", "transform");
      noteNativeTransitionStart(current, "source", monoMs(), "transform");
    }

    let cancelled = false;
    let finished = false;

    const onCancel = () => {
      if (finished || waapiCanonicalPhysicalSatisfied) {
        if (waapiCanonicalPhysicalSatisfied || waapiFillReleaseStarted) {
          const prior = waapiTerminalState;
          emitArmingDiag({
            kind: "MICRO_SLIDE_WAAPI_CANCEL_AFTER_PHYSICAL",
            ...baseFields(),
            monoMs: monoMs(),
            phase: rt().activeTx?.phase ?? current.phase,
            navSeq: rt().activeTx?.navSeq ?? current.navSeq,
            playState: destAnim.playState,
            reason: "fill-release-or-post-physical",
            animationIds,
            terminalState: "cleanup-cancelled-after-finish",
            priorTerminalState: prior,
            physicalSatisfiedBeforeEvent: true,
            physicalSatisfiedAfterEvent: true,
            finalStylesCommitted: true,
            fillReleaseStarted: waapiFillReleaseStarted,
            cancelReason: "fill-release-or-post-physical",
            duration: MAIN_TAB_TO_SHUFFLE_SLIDE_MS,
            easing: MAIN_TAB_TO_SHUFFLE_SLIDE_EASING,
            commitMode: "history",
          });
          emitArmingDiag({
            kind: "MICRO_SLIDE_WAAPI_FILL_RELEASE_CANCEL_IGNORED",
            ...baseFields(),
            monoMs: monoMs(),
            phase: rt().activeTx?.phase ?? current.phase,
            navSeq: rt().activeTx?.navSeq ?? current.navSeq,
            playState: destAnim.playState,
            reason: "WAAPI_CANCEL_AFTER_FILL_RELEASE_IGNORED_FOR_CLEAN",
            animationIds,
            terminalState: "cleanup-cancelled-after-finish",
            priorTerminalState: prior,
            physicalSatisfiedBeforeEvent: true,
            physicalSatisfiedAfterEvent: true,
            finalStylesCommitted: true,
            fillReleaseStarted: waapiFillReleaseStarted,
            cancelReason: "fill-release-or-post-physical",
            duration: MAIN_TAB_TO_SHUFFLE_SLIDE_MS,
            easing: MAIN_TAB_TO_SHUFFLE_SLIDE_EASING,
            commitMode: "history",
          });
          emitWaapiTerminalReduced({
            prior,
            next: "cleanup-cancelled-after-finish",
            baseFields,
            animationIds,
            cancelReason: "fill-release-or-post-physical",
          });
        }
        return;
      }
      cancelled = true;
      const prior = waapiTerminalState;
      emitArmingDiag({
        kind: "MICRO_SLIDE_WAAPI_CANCEL_BEFORE_PHYSICAL",
        ...baseFields(),
        monoMs: monoMs(),
        phase: rt().activeTx?.phase ?? current.phase,
        navSeq: rt().activeTx?.navSeq ?? current.navSeq,
        playState: destAnim.playState,
        reason: "animation-cancel-event",
        animationIds,
        terminalState: "cancelled-before-physical",
        priorTerminalState: prior,
        physicalSatisfiedBeforeEvent: false,
        physicalSatisfiedAfterEvent: false,
        finalStylesCommitted: false,
        fillReleaseStarted: false,
        cancelReason: "animation-cancel-event",
        duration: MAIN_TAB_TO_SHUFFLE_SLIDE_MS,
        easing: MAIN_TAB_TO_SHUFFLE_SLIDE_EASING,
        commitMode: "history",
      });
      emitArmingDiag({
        kind: "MICRO_SLIDE_WAAPI_ANIMATION_CANCELLED",
        ...baseFields(),
        monoMs: monoMs(),
        phase: rt().activeTx?.phase ?? current.phase,
        navSeq: rt().activeTx?.navSeq ?? current.navSeq,
        playState: destAnim.playState,
        reason: "animation-cancel-event",
        animationIds,
      });
      emitWaapiTerminalReduced({
        prior,
        next: "cancelled-before-physical",
        baseFields,
        animationIds,
        cancelReason: "animation-cancel-event",
      });
    };
    activeWaapiCancelHandlers.push(onCancel);
    destAnim.addEventListener("cancel", onCancel);
    sourceAnim.addEventListener("cancel", onCancel);

    const markReadyAndStart = (anim: Animation, role: "source" | "destination") => {
      const live = rt().activeTx;
      if (!live || live.transactionId !== scheduledTransactionId || live.phase !== "sliding") {
        // Late ready after settle/abort: never cancel — that races end-watchdog and
        // destroys in-flight compositor work / poisons CANCELLED classification.
        return;
      }
      emitArmingDiag({
        kind: "MICRO_SLIDE_WAAPI_ANIMATION_READY",
        ...baseFields(),
        monoMs: monoMs(),
        phase: live.phase,
        navSeq: live.navSeq,
        playState: anim.playState,
        readyResolved: true,
        animationIds,
        nodeRole: role,
        reason: "animation-ready-promise",
      });
      noteNativeTransitionRun(live, role, "transform");
      if (anim.playState === "running" || anim.playState === "finished") {
        emitArmingDiag({
          kind: "MICRO_SLIDE_WAAPI_ANIMATION_STARTED",
          ...baseFields(),
          monoMs: monoMs(),
          phase: live.phase,
          navSeq: live.navSeq,
          playState: anim.playState,
          readyResolved: true,
          animationIds,
          nodeRole: role,
          reason: "animation-ready-promise",
        });
        noteNativeTransitionStart(live, role, monoMs(), "transform");
      }
    };

    void destAnim.ready.then(
      () => markReadyAndStart(destAnim, "destination"),
      (err) => {
        emitArmingDiag({
          kind: "MICRO_SLIDE_WAAPI_ANIMATION_REJECTED",
          ...baseFields(),
          monoMs: monoMs(),
          phase: rt().activeTx?.phase ?? current.phase,
          navSeq: rt().activeTx?.navSeq ?? current.navSeq,
          reason: err instanceof Error ? err.message : "ready-rejected",
          animationIds,
        });
      },
    );
    void sourceAnim.ready.then(
      () => markReadyAndStart(sourceAnim, "source"),
      () => {
        /* destination ready/finish is authoritative for settle */
      },
    );

    void destAnim.finished.then(
      () => {
        const live = rt().activeTx;
        if (!live || live.transactionId !== scheduledTransactionId) {
          // Late finish after watchdog/other settle — do not cancel or abort again.
          return;
        }
        if (live.phase !== "sliding") return;
        if (cancelled) {
          emitArmingDiag({
            kind: "MICRO_SLIDE_WAAPI_ANIMATION_CANCELLED",
            ...baseFields(),
            monoMs: monoMs(),
            phase: live.phase,
            navSeq: live.navSeq,
            reason: "finish-after-cancel",
            animationIds,
          });
          if (live.phase === "sliding") {
            finishSlideSettled("waapi-cancel");
          }
          return;
        }
        commitWaapiFinishAndSettle({
          destAnim,
          sourceAnim,
          shuffleHost,
          sourceEl,
          pairs,
          baseFields,
          animationIds,
          onCancel,
          scheduledTransactionId,
          setFinished: (v: boolean) => {
            finished = v;
          },
          setCancelled: (v: boolean) => {
            cancelled = v;
          },
        });
      },
      (err) => {
        emitArmingDiag({
          kind: "MICRO_SLIDE_WAAPI_ANIMATION_REJECTED",
          ...baseFields(),
          monoMs: monoMs(),
          phase: rt().activeTx?.phase ?? current.phase,
          navSeq: rt().activeTx?.navSeq ?? current.navSeq,
          reason: err instanceof Error ? err.message : "finished-rejected",
          animationIds,
        });
        const live = rt().activeTx;
        if (live?.phase === "sliding" && live.transactionId === scheduledTransactionId) {
          finishSlideSettled("waapi-finished-rejected");
        }
      },
    );

    destAnim.addEventListener(
      "finish",
      () => {
        const live = rt().activeTx;
        if (!live || live.transactionId !== scheduledTransactionId || live.phase !== "sliding") {
          return;
        }
        if (finished || cancelled) return;
        commitWaapiFinishAndSettle({
          destAnim,
          sourceAnim,
          shuffleHost,
          sourceEl,
          pairs,
          baseFields,
          animationIds,
          onCancel,
          scheduledTransactionId,
          setFinished: (v: boolean) => {
            finished = v;
          },
          setCancelled: (v: boolean) => {
            cancelled = v;
          },
        });
      },
      { once: true },
    );
  };

  // Synchronous arming: first "frame" with armingFrameCount=0 creates animate() now.
  runtime.diagFinalWriteRafHandle = null;
  runWaapiAfterBarrier(0);

  emitStartSlideAnimationReturned({
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
    callSequence,
    hostInstanceId: destHostNodeId,
    stageInstanceId: observeStageElement(stageEl),
    sourceNodeId: sourceHostNodeId,
    destinationNodeId: destHostNodeId,
    datasetSlideState: html.getAttribute("data-main-tab-shuffle-slide"),
  });
}

function startSlideAnimation() {
  if (shouldSelectWaapiCompositorSlide()) {
    startWaapiCompositorSlideAnimation();
    return;
  }

  const runtime = rt();
  const tx = runtime.activeTx;
  if (!tx || typeof document === "undefined") return;

  const html = document.documentElement;
  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  const sourceEl = document.getElementById(sourceHostId(tx.source));
  const stageElEarly = document.querySelector("[data-main-tab-shuffle-stage]");
  const callSequence = nextStartSlideAnimationCallSequence();
  emitStartSlideAnimationEntered({
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
    callSequence,
    hostInstanceId: observeHostElement(shuffleHost),
    stageInstanceId: observeStageElement(stageElEarly),
    sourceNodeId: observeHostElement(sourceEl),
    destinationNodeId: observeHostElement(shuffleHost),
    datasetSlideState: html.getAttribute("data-main-tab-shuffle-slide"),
  });

  const duration = `${MAIN_TAB_TO_SHUFFLE_SLIDE_MS}ms`;
  const easing = MAIN_TAB_TO_SHUFFLE_SLIDE_EASING;
  const transition = `transform ${duration} ${easing}`;

  tx.phase = "sliding";
  touchSoftCommitTxPin("sliding");
  tx.slideStartedAtMono = monoMs();
  syncPresentationOwnerFromState(runtime);
  notify();
  pushTrace("PHASE_SLIDING");

  if (shuffleHost instanceof HTMLElement) {
    traceSlideDomWrite(
      {
        writerId: "SLIDING_TRANSITION_DESTINATION",
        caller: "startSlideAnimation",
        transactionId: tx.transactionId,
        phase: tx.phase,
        navSeq: tx.navSeq,
        nodeRole: "destination",
        nodeInstanceId: observeHostElement(shuffleHost),
        property: "transition",
        intendedValue: transition,
      },
      shuffleHost,
      (el) => {
        el.style.transition = transition;
      },
    );
  }
  if (sourceEl instanceof HTMLElement) {
    traceSlideDomWrite(
      {
        writerId: "SLIDING_TRANSITION_SOURCE",
        caller: "startSlideAnimation",
        transactionId: tx.transactionId,
        phase: tx.phase,
        navSeq: tx.navSeq,
        nodeRole: "source",
        nodeInstanceId: observeHostElement(sourceEl),
        property: "transition",
        intendedValue: transition,
      },
      sourceEl,
      (el) => {
        el.style.transition = transition;
      },
    );
  }

  html.setAttribute("data-main-tab-shuffle-slide", "running");

  const stageEl = document.querySelector("[data-main-tab-shuffle-stage]");
  const sourceTargetFinal =
    tx.direction === "from-right" ? "translate3d(-100%, 0, 0)" : "translate3d(100%, 0, 0)";
  const destTargetFinal = "translate3d(0, 0, 0)";
  const sourceInitialAssert =
    "translate3d(0, 0, 0)";
  const destInitialAssert =
    tx.direction === "from-right" ? "translate3d(100%, 0, 0)" : "translate3d(-100%, 0, 0)";
  const scheduledMonoMs = monoMs();
  const armingStartedMono = scheduledMonoMs;
  const slideFailsafeExpectedFireMono = scheduledMonoMs + END_WATCHDOG_DELAY_MS;
  const scheduledStageInstanceId = observeStageElement(stageEl);
  const scheduledSourceNodeId = observeHostElement(sourceEl);
  const scheduledDestinationNodeId = observeHostElement(shuffleHost);
  const scheduledPhase = tx.phase;
  const scheduledTransactionId = tx.transactionId;
  const scheduledModuleInstanceId = getTransitionModuleInstanceId();
  const finalWriteRafSequence = nextFinalWriteRafSequence();
  const existingStoredRafHandle = runtime.diagFinalWriteRafHandle;
  const existingStoredRafSequence = runtime.diagFinalWriteRafSequence;
  const armingFrameCount = MAIN_TAB_SHUFFLE_TRANSITION_PRECOMMIT_BARRIER_FRAMES;
  const sourceTab = tx.source;
  const runtimeInstanceId = runtime.runtimeInstanceId;
  const moduleInstanceId = scheduledModuleInstanceId;
  const ringIdentity = getTraceRingIdentity();
  const traceRingId = ringIdentity?.traceRingInstanceId ?? null;

  const armingBaseFields = () =>
    ({
      transactionId: scheduledTransactionId,
      txId: scheduledTransactionId,
      sourceTab,
      commitMode: null as string | null,
      sourceHostId: scheduledSourceNodeId,
      destHostId: scheduledDestinationNodeId,
      targetHostIds: [scheduledSourceNodeId, scheduledDestinationNodeId].filter(Boolean),
      moduleInstanceId,
      runtimeInstanceId,
      traceRingId,
      traceRingInstanceId: traceRingId,
      transitionDuration: MAIN_TAB_TO_SHUFFLE_SLIDE_MS,
      transitionProperty: "transform",
      beforeTransform: sourceInitialAssert,
      afterTransform: sourceTargetFinal,
      reason: "main-tab-shuffle-transition-precommit-barrier",
    }) as Record<string, unknown>;

  // Listeners must be attached before any final transform write (and before barrier frames).
  const hostInstanceId = observeHostElement(shuffleHost);
  emitTransitionListenerAttached({
    hostInstanceId,
    transactionId: tx.transactionId,
    propertyName: "transform",
    navSeq: tx.navSeq,
    phase: tx.phase,
  });

  const onNativeLifecycle = (event: TransitionEvent) => {
    const current = rt().activeTx;
    if (!current || current.phase !== "sliding") return;
    if (current.transactionId !== tx.transactionId) return;
    if (event.propertyName !== "transform") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const role: "source" | "destination" | null =
      target === shuffleHost ? "destination" : target === sourceEl ? "source" : null;
    if (!role) return;
    if (!target.isConnected) return;
    if (event.type === "transitionrun") {
      noteNativeTransitionRun(current, role, event.propertyName);
      return;
    }
    if (event.type === "transitionstart") {
      noteNativeTransitionStart(current, role, monoMs(), event.propertyName);
    }
  };

  const onEnd = (event: TransitionEvent) => {
    const current = rt().activeTx;
    if (!current || current.phase !== "sliding") return;
    if (event.propertyName !== "transform") return;
    if (event.target !== shuffleHost) return;
    emitTransitionEndReceived({
      hostInstanceId: observeHostElement(shuffleHost),
      eventTargetHostInstanceId: observeHostElement(event.target as Element),
      transactionId: current.transactionId,
      propertyName: event.propertyName,
      elapsedTime: event.elapsedTime,
      navSeq: current.navSeq,
      phase: current.phase,
    });
    emitTransitionListenerRemoved({
      hostInstanceId: observeHostElement(shuffleHost),
      transactionId: current.transactionId,
      caller: "startSlideAnimation",
      reason: "transitionend",
      navSeq: current.navSeq,
      phase: current.phase,
    });
    pushTrace("TRANSITION_END");
    emitSettleInitiated({
      caller: "startSlideAnimation:onEnd",
      reason: "transitionend",
      transactionId: current.transactionId,
      phase: current.phase,
      navSeq: current.navSeq,
    });
    finishSlideSettled("transitionend");
  };

  for (const el of [shuffleHost, sourceEl].filter(Boolean)) {
    el?.addEventListener("transitionrun", onNativeLifecycle as EventListener);
    el?.addEventListener("transitionstart", onNativeLifecycle as EventListener);
  }
  shuffleHost?.addEventListener("transitionend", onEnd, { once: true });

  emitArmingDiag({
    kind: "MICRO_SLIDE_TRANSITION_PRECOMMIT_WRITTEN",
    ...armingBaseFields(),
    monoMs: armingStartedMono,
    phase: scheduledPhase,
    navSeq: tx.navSeq,
    sourceBeforeInlineTransform:
      sourceEl instanceof HTMLElement ? sourceEl.style.transform || null : null,
    destinationBeforeInlineTransform:
      shuffleHost instanceof HTMLElement ? shuffleHost.style.transform || null : null,
    sourceInlineTransition:
      sourceEl instanceof HTMLElement ? sourceEl.style.transition || null : null,
    destinationInlineTransition:
      shuffleHost instanceof HTMLElement ? shuffleHost.style.transition || null : null,
    armingFrameCount,
    noLayoutReadsConfirmed: true,
  });
  emitArmingDiag({
    kind: "MICRO_SLIDE_TRANSITION_ARMING_NO_LAYOUT_READS_CONFIRMED",
    ...armingBaseFields(),
    monoMs: monoMs(),
    phase: scheduledPhase,
    navSeq: tx.navSeq,
    noLayoutReadsConfirmed: true,
  });

  emitSlideFinalWriteRafScheduleRequested({
    transactionId: scheduledTransactionId,
    phase: scheduledPhase,
    navSeq: tx.navSeq,
    finalWriteRafSequence,
    sourceNodeId: scheduledSourceNodeId,
    destinationNodeId: scheduledDestinationNodeId,
    stageInstanceId: scheduledStageInstanceId,
    hostInstanceId: scheduledDestinationNodeId,
    datasetSlideState: html.getAttribute("data-main-tab-shuffle-slide"),
    existingStoredRafHandle,
    existingStoredRafSequence,
    documentVisibilityState: document.visibilityState,
    documentHasFocus: document.hasFocus(),
  });

  emitSlideFinalWriteRafScheduled({
    transactionId: scheduledTransactionId,
    phase: scheduledPhase,
    navSeq: tx.navSeq,
    scheduledMonoMs,
    sourceNodeId: scheduledSourceNodeId,
    destinationNodeId: scheduledDestinationNodeId,
    stageInstanceId: scheduledStageInstanceId,
    hostInstanceId: scheduledDestinationNodeId,
    datasetSlideState: html.getAttribute("data-main-tab-shuffle-slide"),
    documentVisibilityState: document.visibilityState,
    documentHasFocus: document.hasFocus(),
    slideStartMono: tx.slideStartedAtMono ?? null,
    slideFailsafeExpectedFireMono,
  });

  let barrierFrameIndex = 0;

  const runPrecommitBarrierFrame = (rafCallbackTimestamp: number) => {
    const currentRuntime = rt();
    const callbackSourceConnected = sourceEl instanceof HTMLElement ? sourceEl.isConnected : null;
    const callbackDestConnected = shuffleHost instanceof HTMLElement ? shuffleHost.isConnected : null;
    barrierFrameIndex += 1;
    const frameIndex = barrierFrameIndex;

    emitSlideFinalWriteRafCallbackEntered({
      transactionId: currentRuntime.activeTx?.transactionId ?? scheduledTransactionId,
      scheduledTransactionId,
      scheduledMonoMs,
      rafCallbackTimestamp,
      scheduledPhase,
      currentPhase: currentRuntime.activeTx?.phase ?? null,
      navSeq: currentRuntime.activeTx?.navSeq ?? tx.navSeq,
      sourceNodeId: observeHostElement(sourceEl),
      destinationNodeId: observeHostElement(shuffleHost),
      sourceIsConnected: callbackSourceConnected,
      destinationIsConnected: callbackDestConnected,
      stageInstanceId: observeStageElement(stageEl),
      hostInstanceId: observeHostElement(shuffleHost),
      datasetSlideState: html.getAttribute("data-main-tab-shuffle-slide"),
      documentVisibilityState: document.visibilityState,
      documentHasFocus: document.hasFocus(),
      finalWriteRafSequence,
      nativeRafHandleFromClosure: currentRuntime.diagFinalWriteRafHandle,
      currentStoredRafHandle: currentRuntime.diagFinalWriteRafHandle,
      currentStoredRafSequence: currentRuntime.diagFinalWriteRafSequence,
      scheduledModuleInstanceId,
      currentModuleInstanceId: getTransitionModuleInstanceId(),
      scheduledStageInstanceId,
      currentStageInstanceId: observeStageElement(stageEl),
      scheduledSourceNodeId,
      scheduledDestinationNodeId,
      currentSourceNodeId: observeHostElement(sourceEl),
      currentDestinationNodeId: observeHostElement(shuffleHost),
      performanceNow: diagPerformanceNow(),
      performanceTimeOrigin: diagPerformanceTimeOrigin(),
      browserRealmInstanceId: getBrowserRealmInstanceId(),
      documentInstanceId: getDocumentInstanceId(),
    });

    const current = currentRuntime.activeTx;
    if (
      !current ||
      current.transactionId !== scheduledTransactionId ||
      current.phase !== "sliding" ||
      scheduledModuleInstanceId !== getTransitionModuleInstanceId()
    ) {
      emitArmingDiag({
        kind: "MICRO_SLIDE_TRANSITION_ARMING_ABORTED_STALE_TX",
        ...armingBaseFields(),
        monoMs: monoMs(),
        phase: current?.phase ?? "idle",
        navSeq: current?.navSeq ?? tx.navSeq,
        frameIndex,
        reason: !current
          ? "no-active-tx"
          : current.transactionId !== scheduledTransactionId
            ? "tx-mismatch"
            : current.phase !== "sliding"
              ? "phase-not-sliding"
              : "module-reinit",
        armingLatencyMs: monoMs() - armingStartedMono,
        armingFrameCount: frameIndex,
      });
      return;
    }

    if (callbackSourceConnected === false || callbackDestConnected === false) {
      emitArmingDiag({
        kind: "MICRO_SLIDE_TRANSITION_ARMING_TARGET_NOT_READY",
        ...armingBaseFields(),
        monoMs: monoMs(),
        phase: current.phase,
        navSeq: current.navSeq,
        frameIndex,
        sourceIsConnected: callbackSourceConnected,
        destinationIsConnected: callbackDestConnected,
        reason: "host-disconnected",
      });
      return;
    }

    emitArmingDiag({
      kind: "MICRO_SLIDE_TRANSITION_ARMING_TARGET_READY",
      ...armingBaseFields(),
      monoMs: monoMs(),
      phase: current.phase,
      navSeq: current.navSeq,
      frameIndex,
      sourceIsConnected: callbackSourceConnected,
      destinationIsConnected: callbackDestConnected,
    });

    if (frameIndex === 1) {
      emitArmingDiag({
        kind: "MICRO_SLIDE_TRANSITION_PRECOMMIT_FRAME_BARRIER_ARMED",
        ...armingBaseFields(),
        monoMs: monoMs(),
        phase: current.phase,
        navSeq: current.navSeq,
        frameIndex: 1,
        armingFrameCount,
      });
      emitArmingDiag({
        kind: "MICRO_SLIDE_TRANSITION_PRECOMMIT_FRAME_BARRIER_PASSED",
        ...armingBaseFields(),
        monoMs: monoMs(),
        phase: current.phase,
        navSeq: current.navSeq,
        frameIndex: 1,
        armingFrameCount,
      });
      // Re-assert initial transforms without changing values — keeps precommit state stable
      // while transition-property commits. No layout reads.
      if (shuffleHost instanceof HTMLElement) {
        shuffleHost.style.transform = destInitialAssert;
      }
      if (sourceEl instanceof HTMLElement) {
        sourceEl.style.transform = sourceInitialAssert;
      }
      const nextHandle = requestAnimationFrame(runPrecommitBarrierFrame);
      currentRuntime.diagFinalWriteRafHandle = nextHandle;
      currentRuntime.diagFinalWriteRafSequence = finalWriteRafSequence;
      emitSlideFinalWriteRafHandleAssigned({
        transactionId: scheduledTransactionId,
        phase: scheduledPhase,
        navSeq: tx.navSeq,
        finalWriteRafSequence,
        nativeRafHandle: nextHandle,
        sourceNodeId: scheduledSourceNodeId,
        destinationNodeId: scheduledDestinationNodeId,
        stageInstanceId: scheduledStageInstanceId,
        hostInstanceId: scheduledDestinationNodeId,
      });
      return;
    }

    // Frame 2+: transition CSS has had a full style/paint commit tick; apply final transforms.
    emitArmingDiag({
      kind: "MICRO_SLIDE_TRANSITION_PRECOMMIT_FRAME_BARRIER_PASSED",
      ...armingBaseFields(),
      monoMs: monoMs(),
      phase: current.phase,
      navSeq: current.navSeq,
      frameIndex,
      armingFrameCount,
    });

    const armingLatencyMs = monoMs() - armingStartedMono;
    emitArmingDiag({
      kind: "MICRO_SLIDE_TRANSITION_FINAL_WRITE_AFTER_PRECOMMIT",
      ...armingBaseFields(),
      monoMs: monoMs(),
      phase: current.phase,
      navSeq: current.navSeq,
      frameIndex,
      armingLatencyMs,
      armingFrameCount: frameIndex,
      noLayoutReadsConfirmed: true,
    });
    emitArmingDiag({
      kind: "MICRO_SLIDE_TRANSITION_ARMING_LATENCY_MS",
      ...armingBaseFields(),
      monoMs: monoMs(),
      phase: current.phase,
      navSeq: current.navSeq,
      armingLatencyMs,
      armingFrameCount: frameIndex,
    });
    emitArmingDiag({
      kind: "MICRO_SLIDE_TRANSITION_ARMING_FRAME_COUNT",
      ...armingBaseFields(),
      monoMs: monoMs(),
      phase: current.phase,
      navSeq: current.navSeq,
      armingFrameCount: frameIndex,
    });

    const sourceSnap = readSlideDomInlineSnapshot(sourceEl);
    const destSnap = readSlideDomInlineSnapshot(shuffleHost);
    emitSlideFinalTransformsWriteAttempt({
      transactionId: current.transactionId,
      phase: current.phase,
      navSeq: current.navSeq,
      sourceNodeId: observeHostElement(sourceEl),
      destinationNodeId: observeHostElement(shuffleHost),
      sourceBeforeInlineTransform: sourceSnap?.inlineTransform ?? null,
      destinationBeforeInlineTransform: destSnap?.inlineTransform ?? null,
      sourceTargetTransform: sourceTargetFinal,
      destinationTargetTransform: destTargetFinal,
      sourceInlineTransition: sourceSnap?.inlineTransition ?? null,
      destinationInlineTransition: destSnap?.inlineTransition ?? null,
      datasetSlideState: html.getAttribute("data-main-tab-shuffle-slide"),
      stageInstanceId: observeStageElement(stageEl),
      hostInstanceId: observeHostElement(shuffleHost),
    });
    if (shuffleHost instanceof HTMLElement) {
      traceSlideDomWrite(
        {
          writerId: "SLIDING_FINAL_DESTINATION",
          caller: "startSlideAnimation:precommit-barrier",
          transactionId: current.transactionId,
          phase: current.phase,
          navSeq: current.navSeq,
          nodeRole: "destination",
          nodeInstanceId: observeHostElement(shuffleHost),
          property: "transform",
          intendedValue: destTargetFinal,
        },
        shuffleHost,
        (el) => {
          el.style.transform = destTargetFinal;
        },
      );
    }
    if (sourceEl instanceof HTMLElement) {
      traceSlideDomWrite(
        {
          writerId: "SLIDING_FINAL_SOURCE",
          caller: "startSlideAnimation:precommit-barrier",
          transactionId: current.transactionId,
          phase: current.phase,
          navSeq: current.navSeq,
          nodeRole: "source",
          nodeInstanceId: observeHostElement(sourceEl),
          property: "transform",
          intendedValue: sourceTargetFinal,
        },
        sourceEl,
        (el) => {
          el.style.transform = sourceTargetFinal;
        },
      );
    }
    emitSlideFinalTransformsWriteReturned({
      transactionId: current.transactionId,
      phase: current.phase,
      navSeq: current.navSeq,
      sourceNodeId: observeHostElement(sourceEl),
      destinationNodeId: observeHostElement(shuffleHost),
      sourceAfterInlineTransform: sourceEl instanceof HTMLElement ? sourceEl.style.transform || null : null,
      destinationAfterInlineTransform:
        shuffleHost instanceof HTMLElement ? shuffleHost.style.transform || null : null,
      sourceAfterInlineTransition:
        sourceEl instanceof HTMLElement ? sourceEl.style.transition || null : null,
      destinationAfterInlineTransition:
        shuffleHost instanceof HTMLElement ? shuffleHost.style.transition || null : null,
      sourceIsConnected: sourceEl instanceof HTMLElement ? sourceEl.isConnected : null,
      destinationIsConnected: shuffleHost instanceof HTMLElement ? shuffleHost.isConnected : null,
      datasetSlideState: html.getAttribute("data-main-tab-shuffle-slide"),
    });
    noteSlideFinalWriteCommitted(current);
  };

  const nativeRafHandle = requestAnimationFrame(runPrecommitBarrierFrame);

  runtime.diagFinalWriteRafHandle = nativeRafHandle;
  runtime.diagFinalWriteRafSequence = finalWriteRafSequence;
  emitSlideFinalWriteRafHandleAssigned({
    transactionId: scheduledTransactionId,
    phase: scheduledPhase,
    navSeq: tx.navSeq,
    finalWriteRafSequence,
    nativeRafHandle,
    sourceNodeId: scheduledSourceNodeId,
    destinationNodeId: scheduledDestinationNodeId,
    stageInstanceId: scheduledStageInstanceId,
    hostInstanceId: scheduledDestinationNodeId,
  });

  // Three-stage watchdog: pre-write → post-write/pre-start → end from LAST_OBSERVED_VALID_START.
  runtime.slideFinalWriteCommittedMono = null;
  runtime.sourceTransitionStartedMono = null;
  runtime.destinationTransitionStartedMono = null;
  runtime.slideTransitionStartedMono = null;
  armPreWriteWatchdog(tx);

  emitStartSlideAnimationReturned({
    transactionId: tx.transactionId,
    phase: tx.phase,
    navSeq: tx.navSeq,
    callSequence,
    hostInstanceId: observeHostElement(shuffleHost),
    stageInstanceId: observeStageElement(stageEl),
    sourceNodeId: observeHostElement(sourceEl),
    destinationNodeId: observeHostElement(shuffleHost),
    datasetSlideState: html.getAttribute("data-main-tab-shuffle-slide"),
  });
}

function finishSlideSettled(settleReason = "transitionend") {
  const runtime = rt();
  const tx = runtime.activeTx;
  if (!tx) return;
  if (tx.phase !== "sliding") return;

  // If end-watchdog raced a main-thread-delayed WAAPI finished promise, promote when
  // the animation has been running at least the slide duration (wall clock from start
  // anchor). Watchdog functions themselves unchanged.
  if (
    activeWaapiAnimations.length > 0 &&
    activeWaapiTxId === tx.transactionId &&
    settleReason !== "waapi-finish" &&
    settleReason !== "waapi-watchdog-promoted-finish" &&
    settleReason !== "waapi-cancel" &&
    String(settleReason || "").includes("watchdog")
  ) {
    const destAnim = activeWaapiAnimations[0];
    const sourceAnim = activeWaapiAnimations[1] ?? destAnim;
    if (!destAnim) {
      /* fall through to normal settle */
    } else {
    const startedMono = runtime.slideTransitionStartedMono ?? tx.slideStartedAtMono;
    const elapsed =
      typeof startedMono === "number" ? Math.max(0, monoMs() - startedMono) : 0;
    const due =
      elapsed >= MAIN_TAB_TO_SHUFFLE_SLIDE_MS &&
      (waapiAnimationEffectivelyDone(destAnim) ||
        destAnim.playState === "running" ||
        destAnim.playState === "finished");
    if (due) {
      const promoteBase = () => ({
        transactionId: tx.transactionId,
        txId: tx.transactionId,
        sourceTab: tx.source,
        commitMode: "history" as const,
        duration: MAIN_TAB_TO_SHUFFLE_SLIDE_MS,
        easing: MAIN_TAB_TO_SHUFFLE_SLIDE_EASING,
        moduleInstanceId: getTransitionModuleInstanceId(),
        runtimeInstanceId: runtime.runtimeInstanceId,
        reason: "promoted-from-end-watchdog-after-duration",
        elapsedSinceStartMs: elapsed,
        playStateAtPromote: destAnim.playState,
      });
      const startedOk =
        typeof runtime.slideTransitionStartedMono === "number" ||
        typeof tx.slideStartedAtMono === "number" ||
        destAnim.playState === "running" ||
        destAnim.playState === "finished";
      const animIds = [destAnim.id || "dest", (sourceAnim ?? destAnim).id || "source"];
      emitArmingDiag({
        kind: "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_REQUESTED",
        ...promoteBase(),
        monoMs: monoMs(),
        phase: tx.phase,
        navSeq: tx.navSeq,
        animationIds: animIds,
        watchdogReason: settleReason,
        promoteReason: "promoted-from-end-watchdog-after-duration",
        terminalState: waapiTerminalState,
        priorTerminalState: waapiTerminalState,
        physicalSatisfiedBeforeEvent: waapiCanonicalPhysicalSatisfied,
        physicalSatisfiedAfterEvent: waapiCanonicalPhysicalSatisfied,
        finalStylesCommitted: false,
        fillReleaseStarted: waapiFillReleaseStarted,
      });
      if (!startedOk || waapiTerminalState === "cancelled-before-physical") {
        emitArmingDiag({
          kind: "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_REJECTED",
          ...promoteBase(),
          monoMs: monoMs(),
          phase: tx.phase,
          navSeq: tx.navSeq,
          animationIds: animIds,
          watchdogReason: settleReason,
          promoteReason: !startedOk ? "missing-started" : "cancelled-before-physical",
          terminalState: waapiTerminalState,
          priorTerminalState: waapiTerminalState,
          physicalSatisfiedBeforeEvent: false,
          physicalSatisfiedAfterEvent: false,
          finalStylesCommitted: false,
          fillReleaseStarted: false,
        });
      } else {
      try {
        if (destAnim.playState === "running" || (destAnim.playState as string) === "pending") {
          destAnim.finish();
        }
        if (
          sourceAnim &&
          (sourceAnim.playState === "running" || (sourceAnim.playState as string) === "pending")
        ) {
          sourceAnim.finish();
        }
      } catch {
        /* ignore */
      }
      const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
      const sourceEl = document.getElementById(sourceHostId(tx.source));
      if (shuffleHost instanceof HTMLElement && sourceEl instanceof HTMLElement) {
        const pairs = waapiKeyframePair(tx.direction);
        const noop = () => {};
        emitArmingDiag({
          kind: "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_ACCEPTED",
          ...promoteBase(),
          monoMs: monoMs(),
          phase: tx.phase,
          navSeq: tx.navSeq,
          animationIds: animIds,
          watchdogReason: settleReason,
          promoteReason: "promoted-from-end-watchdog-after-duration",
          terminalState: "finished-promoted",
          priorTerminalState: waapiTerminalState,
          physicalSatisfiedBeforeEvent: false,
          physicalSatisfiedAfterEvent: true,
          finalStylesCommitted: false,
          fillReleaseStarted: false,
        });
        commitWaapiFinishAndSettle({
          destAnim,
          sourceAnim: sourceAnim ?? destAnim,
          shuffleHost,
          sourceEl,
          pairs,
          baseFields: promoteBase,
          animationIds: animIds,
          onCancel: noop,
          scheduledTransactionId: tx.transactionId,
          setFinished: noop,
          setCancelled: noop,
          promotedByWatchdog: true,
          promoteReason: "promoted-from-end-watchdog-after-duration",
          watchdogReason: settleReason,
        });
        return;
      }
      emitArmingDiag({
        kind: "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_REJECTED",
        ...promoteBase(),
        monoMs: monoMs(),
        phase: tx.phase,
        navSeq: tx.navSeq,
        animationIds: animIds,
        watchdogReason: settleReason,
        promoteReason: "surfaces-invalid",
        terminalState: waapiTerminalState,
        priorTerminalState: waapiTerminalState,
        physicalSatisfiedBeforeEvent: false,
        physicalSatisfiedAfterEvent: false,
        finalStylesCommitted: false,
        fillReleaseStarted: false,
      });
      }
    }
    }
  }

  clearAllSlideWatchdogs("finishSlideSettled", settleReason);

  const readiness = getShuffleDestinationReadiness();
  if (!readiness.ready) {
    abortMainTabToShuffleTransition("destination-lost-before-settle");
    return;
  }

  tx.phase = "settled";
  tx.slideEndedAtMono = monoMs();
  syncPresentationOwnerFromState(runtime);
  pushTrace("SETTLED", { readiness, note: settleReason });
  notify();

  normalizeShuffleHostAfterSlideSettle();
  startPostSettleRouteBridge();
  clearSlideAnimationDomState({ removeSlideShuffleActive: true });
  notify();

  if (isNavTraceEnabled()) {
    console.info("[main-tab-shuffle-slide] settled", { navSeq: tx.navSeq, settleReason });
  }
}

function atomicReadySwap() {
  const runtime = rt();
  const tx = runtime.activeTx;
  if (!tx) return;
  const readiness = getShuffleDestinationReadiness();
  if (!readiness.ready) {
    abortMainTabToShuffleTransition("destination-not-ready-swap");
    return;
  }
  tx.destinationReadyAtMono = monoMs();
  tx.phase = "settled";
  syncPresentationOwnerFromState(runtime);
  pushTrace("SETTLED", { readiness });
  notify();
  normalizeShuffleHostAfterSlideSettle();
  startPostSettleRouteBridge();
  clearSlideAnimationDomState({ removeSlideShuffleActive: true });
  notify();
}

function startReadinessLoop() {
  const runtime = rt();
  runtime.prepLoopId += 1;
  const loopId = runtime.prepLoopId;
  let frames = 0;
  resetShuffleDestinationReadinessStability();
  pushTrace("READINESS_LOOP_STARTED");
  pushTrace("READINESS_SAMPLE", {
    note: "MICRO_SLIDE_WAITING_FOR_SHUFFLE_READY",
    readiness: getShuffleDestinationReadiness(),
  });

  const tick = () => {
    const currentRuntime = rt();
    const tx = currentRuntime.activeTx;
    if (!tx || currentRuntime.prepLoopId !== loopId) return;
    if (tx.phase !== "preparing") return;

    frames += 1;
    const readiness = getShuffleDestinationReadiness();
    const visual = getShuffleDestinationVisualReadiness();
    if (frames === 1 || frames % 4 === 0) {
      pushTrace("READINESS_SAMPLE", {
        readiness,
        note: visual.ready
          ? "visual-ready"
          : `MICRO_SLIDE_DESTINATION_NOT_READY_NO_LOADING_CONTRACT_HELD:${visual.reason}`,
      });
    }

    if (visual.hasLoadingShell) {
      if (frames === 1 || frames % 8 === 0) {
        pushTrace("LEGACY_PRESENTATION_BLOCKED_BY_SLIDE_OWNER", {
          note: "MICRO_SLIDE_BLOCKED_DESTINATION_LOADING_SHELL",
        });
      }
    } else if (visual.loadingTextVisibleInDestination) {
      if (frames === 1 || frames % 8 === 0) {
        pushTrace("LEGACY_PRESENTATION_BLOCKED_BY_SLIDE_OWNER", {
          note: "MICRO_SLIDE_BLOCKED_DESTINATION_LOADING_TEXT",
        });
      }
    }

    if (
      observeShuffleDestinationReadinessStable() &&
      visual.ready &&
      !visual.hasLoadingShell &&
      !visual.loadingTextVisibleInDestination &&
      visual.slotCount >= 3
    ) {
      // No-loading contract: commit route only once destination can present without loading.
      flushDeferredMicroSlideRouteCommit();
      pushTrace("NAVIGATION_COMMIT_NOTIFIED", {
        note: "TAB_HANDOFF_ROUTE_COMMIT_APPLIED",
      });

      tx.destinationReadyAtMono = monoMs();
      tx.phase = "armed";
      touchSoftCommitTxPin("armed");
      syncPresentationOwnerFromState(currentRuntime);
      pushTrace("DESTINATION_READY", {
        readiness,
        note: visual.poolWarmState === "ready" ? "MICRO_SLIDE_READY_AFTER_WARMUP" : undefined,
      });
      pushTrace("PHASE_ARMED", { readiness });
      notify();
      applyArmedDomState();

      if (prefersReducedMotion()) {
        atomicReadySwap();
        return;
      }

      requestAnimationFrame(() => {
        const armed = rt().activeTx;
        if (!armed || armed.phase !== "armed") return;
        const recheck = getShuffleDestinationVisualReadiness();
        if (
          !recheck.ready ||
          recheck.hasLoadingShell ||
          recheck.loadingTextVisibleInDestination
        ) {
          pushTrace("ABORTED", {
            note: `MICRO_SLIDE_BLOCKED_DESTINATION_LOADING_SHELL:pre-slide-recheck:${recheck.reason}`,
          });
          abortMainTabToShuffleTransition("no-loading-contract-pre-slide");
          return;
        }
        startSlideAnimation();
      });
      return;
    }

    // Fresh/anon empty pool: still commit /shuffle once loading chrome is gone so
    // the browser route aligns with the tab handoff (avoids ROUTE_MISMATCH).
    // Wait a few frames so in-flight pool warmup can claim "warming" first.
    if (
      frames >= 30 &&
      !visual.hasLoadingShell &&
      !visual.loadingTextVisibleInDestination &&
      visual.hasShuffleList &&
      visual.poolWarmState === "empty"
    ) {
      flushDeferredMicroSlideRouteCommit();
      pushTrace("DESTINATION_READY", {
        readiness,
        note: "TAB_HANDOFF_DESTINATION_EMPTY_STATE_READY:route-commit",
      });
      pushTrace("NAVIGATION_COMMIT_NOTIFIED", {
        note: "TAB_HANDOFF_ROUTE_COMMIT_APPLIED:empty-pool",
      });
      abortMainTabToShuffleTransition("empty-pool-route-committed");
      return;
    }

    if (frames >= getPrepFrameBudget()) {
      // Never leave the user click without a route commit — flush first, then abort slide.
      flushDeferredMicroSlideRouteCommit();
      pushTrace("NAVIGATION_COMMIT_NOTIFIED", {
        note: "TAB_HANDOFF_ROUTE_COMMIT_APPLIED:prep-timeout-flush",
      });
      pushTrace("ABORTED", {
        note: "MICRO_SLIDE_NO_LOADING_CONTRACT_TIMEOUT",
        readiness,
      });
      abortMainTabToShuffleTransition("prep-timeout");
      return;
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

export function subscribeMainTabToShuffleTransition(listener: () => void) {
  const runtime = rt();
  runtime.listeners.add(listener);
  return () => runtime.listeners.delete(listener);
}

export function getMainTabToShuffleTransitionVersion() {
  return rt().navSeq;
}

export function getMainTabToShuffleTransaction() {
  return rt().activeTx;
}

export function getMainTabToShufflePhase(): MainTabToShufflePhase {
  return rt().activeTx?.phase ?? "idle";
}

export function isInternalMainTabToShuffleTransitionActive() {
  const runtime = rt();
  if (runtime.presentationLatchNavSeq !== null && runtime.activeTx) return true;
  const tx = runtime.activeTx;
  if (!tx) return false;
  return ownsCanonicalPresentationPhase(tx.phase);
}

export function isMainTabToShuffleNavigationBlocked() {
  return rt().activeTx?.phase === "sliding";
}

export function pathToMainTabShuffleSource(pathname: string): MainTabShuffleSource | null {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path === "/stories") return "stories";
  if (path === "/chats" || path.startsWith("/chat/")) return "chats";
  if (path === "/boost" || path.startsWith("/boost/")) return "boost";
  if (path === "/settings" || path.startsWith("/settings/")) return "settings";
  return null;
}

/** Register transaction synchronously before router navigation. */
export function beginInternalMainTabToShuffleTransition(
  source: MainTabShuffleSource,
  options?: { triggerType?: MicroSlideNavTriggerType },
) {
  if (!isMainTabToShuffleMicroSlideEnabled()) return false;
  if (typeof window === "undefined") return false;

  const triggerType: MicroSlideNavTriggerType =
    options?.triggerType ?? "user-main-tab-pointerdown";

  if (isHistoryPopstateRestoreInProgress() || !canBeginMicroSlideFromWarmTrigger(triggerType)) {
    reportMicroSlideTransitionBeginBlocked(triggerType, "beginInternalMainTabToShuffleTransition");
    const stalePin = getSoftCommitTxPin();
    if (stalePin && !stalePin.isSoftCommitInFlight && stalePin.phase === "preparing") {
      clearSoftCommitTxPin("no-active-tx", {
        moduleInstanceId: TRANSITION_MODULE_INSTANCE_ID,
        runtimeInstanceId: rt().runtimeInstanceId,
        activeTxPresent: false,
      });
      reportStalePinClearedNoTx(
        stalePin.txId,
        "beginInternalMainTabToShuffleTransition",
        "begin-blocked-clear-stale",
      );
    }
    return false;
  }

  // Prefer an armed click intent when present (pointerdown path).
  void peekMicroSlideUserClickIntent();

  const runtime = rt();
  const existing = runtime.activeTx;
  if (existing?.phase === "preparing" && existing.source === source) {
    const pin = getSoftCommitTxPin();
    if (!pin || pin.txId !== existing.transactionId) {
      pinSoftCommitTx({
        txId: existing.transactionId,
        sourceTab: existing.source,
        phase: existing.phase,
        navSeq: existing.navSeq,
        sourcePath: existing.sourcePath,
        direction: existing.direction,
        createdMono: existing.createdMono,
        startedAtMono: existing.startedAtMono,
        moduleInstanceId: TRANSITION_MODULE_INSTANCE_ID,
        runtimeInstanceId: runtime.runtimeInstanceId,
        activeTxPresent: true,
      });
    }
    consumeMicroSlideUserClickIntent(pathnameNow() || undefined);
    return true;
  }

  const activePin = getSoftCommitTxPin();
  if (
    activePin &&
    shouldBlockLegacyShufflePresentationDueToPinnedTx() &&
    activePin.sourceTab === source &&
    activePin.phase === "preparing"
  ) {
    if (!runtime.activeTx) {
      rehydrateSoftCommitPinnedTxAfterModuleReinit(TRANSITION_MODULE_INSTANCE_ID);
      return Boolean(rt().activeTx);
    }
    if (runtime.activeTx.transactionId === activePin.txId) {
      return true;
    }
  }

  if (isInternalMainTabToShuffleTransitionActive()) {
    abortMainTabToShuffleTransition("replaced");
  } else if (activePin && shouldBlockLegacyShufflePresentationDueToPinnedTx()) {
    clearSoftCommitTxPin("replaced", {
      moduleInstanceId: TRANSITION_MODULE_INSTANCE_ID,
      runtimeInstanceId: runtime.runtimeInstanceId,
      activeTxPresent: false,
    });
  }

  runtime.navSeq += 1;
  armPresentationLatch(runtime.navSeq);
  const sourcePath = pathnameNow() || `/${source}`;
  const createdMono = monoMs();
  const transactionId = nextCanonicalTransactionId(runtime.navSeq, sourcePath);
  runtime.activeTx = {
    transactionId,
    navSeq: runtime.navSeq,
    sourcePath,
    createdMono,
    source,
    destination: "shuffle",
    direction: directionForSource(source),
    phase: "preparing",
    startedAtMono: createdMono,
    destinationReadyAtMono: null,
    slideStartedAtMono: null,
    slideEndedAtMono: null,
    abortReason: null,
  };
  syncPresentationOwnerFromState(runtime);
  emitTransactionRefAssigned(transactionId, runtime.navSeq, sourcePath, createdMono, "preparing");
  pinSoftCommitTx({
    txId: transactionId,
    sourceTab: source,
    phase: "preparing",
    navSeq: runtime.navSeq,
    sourcePath,
    direction: runtime.activeTx.direction,
    createdMono,
    startedAtMono: createdMono,
    moduleInstanceId: TRANSITION_MODULE_INSTANCE_ID,
    runtimeInstanceId: runtime.runtimeInstanceId,
    activeTxPresent: true,
  });
  resetShuffleDestinationReadinessStability();
  applyPreparingDomState(source);
  reportMicroSlideTransitionBeginAllowed(triggerType, {
    txId: transactionId,
    caller: "beginInternalMainTabToShuffleTransition",
  });
  consumeMicroSlideUserClickIntent(sourcePath);
  pushTrace("TRANSITION_BEGIN", { note: `source=${source}` });
  notify();

  if (isNavTraceEnabled()) {
    console.info("[main-tab-shuffle-slide] preparing", {
      navSeq: runtime.navSeq,
      source,
      direction: runtime.activeTx.direction,
    });
  }

  return true;
}

export function notifyMainTabToShuffleNavigationCommitted() {
  const tx = rt().activeTx;
  if (!tx || tx.phase !== "preparing") return;
  pushTrace("NAVIGATION_COMMIT_NOTIFIED");
  startReadinessLoop();
}

export function abortMainTabToShuffleTransition(reason: string) {
  const runtime = rt();
  const tx = runtime.activeTx;
  // Always invalidate deferred/timer Shuffle commits first so a mid-slide
  // Stories/Chats/Boost/Settings tap cannot be overwritten by a late /shuffle push.
  cancelPendingShuffleRouteCommits(reason || "abort");
  if (!tx) {
    clearSoftCommitTxPin(reason || "manual-abort", {
      moduleInstanceId: TRANSITION_MODULE_INSTANCE_ID,
      runtimeInstanceId: runtime.runtimeInstanceId,
      activeTxPresent: false,
    });
    // Warm handoff may have armed entry pending before a tx existed.
    clearShuffleEntryHandoffAfterTransitionAbort();
    return;
  }
  tx.phase = "aborted";
  tx.abortReason = reason;
  syncPresentationOwnerFromState(runtime);
  pushTrace("ABORTED", { note: reason });
  notify();

  if (isNavTraceEnabled()) {
    console.info("[main-tab-shuffle-slide] aborted", reason);
  }

  clearSlideDomState();
  cancelScheduledPresentationLatchRelease();
  cancelPostSettleBridgeObservation();
  releasePresentationLatch();
  runtime.postSettleBridgeActive = false;
  runtime.postSettleBridgeTransactionId = null;
  runtime.bridgeObserverOwnerModuleId = null;
  runtime.prepLoopId += 1;
  clearAllSlideWatchdogs("abortMainTabToShuffleTransition", reason);
  cancelActiveWaapiAnimations(reason || "abort");
  clearTransactionRef("abortMainTabToShuffleTransition", reason);
  // Entry handoff CSS (sayittome-shuffle-handoff-pending) is armed by
  // beginShuffleWarmHandoff before the slide owns presentation. Abort must
  // drop it synchronously or a mid-slide Stories tap can land with pending
  // still on <html> and paint cold destination loading under a stale defer.
  clearShuffleEntryHandoffAfterTransitionAbort();
  notify();
}

export function blockMainTabNavigationDuringSlide() {
  return rt().activeTx?.phase === "sliding";
}

export function shouldBlockLegacyShufflePresentation() {
  if (!isMainTabToShuffleMicroSlideEnabled()) return false;
  if (shouldBlockLegacyShufflePresentationDueToPinnedTx()) {
    return true;
  }
  const runtime = rt();
  if (runtime.presentationLatchNavSeq !== null) return true;
  if (runtime.postSettleBridgeActive) return true;
  const tx = runtime.activeTx;
  if (!tx) return false;
  return ownsCanonicalPresentationPhase(tx.phase);
}

export function isMainTabToShufflePresentationOwned() {
  return shouldBlockLegacyShufflePresentation();
}

export function recordLegacyPresentationBlocked(caller: string) {
  const runtime = rt();
  const tx = runtime.activeTx;
  if (shouldBlockLegacyShufflePresentationDueToPinnedTx()) {
    noteLegacyRevealBlockedByPinnedTx(caller);
  }
  pushTrace("LEGACY_PRESENTATION_BLOCKED_BY_SLIDE_OWNER", {
    note: caller,
    transactionId: tx?.transactionId ?? getSoftCommitTxPin()?.txId,
    phase: tx?.phase ?? getSoftCommitTxPin()?.phase ?? "idle",
  });
}

/**
 * Localhost-only: simulate prod failure mode where soft router.push re-inits
 * presentation runtime while soft-commit pin survives on globalThis.
 */
export function forceSoftPushModuleReinitForTestOnly(): boolean {
  if (!isForceSoftPushModuleReinitForTestEnabled()) return false;
  const pin = getSoftCommitTxPin();
  if (!pin || !pin.isSoftCommitInFlight) return false;
  resetMainTabShufflePresentationRuntimeForTests();
  const forcedModuleId = `module-forced-reinit-${monoMs()}-${Math.random().toString(36).slice(2, 8)}`;
  noteSoftCommitRuntimeReinitAfterSoftPush({
    moduleInstanceId: forcedModuleId,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
    previousModuleInstanceId: pin.moduleInstanceIdOriginal,
    previousRuntimeInstanceId: pin.runtimeInstanceIdOriginal,
  });
  return rehydrateSoftCommitPinnedTxAfterModuleReinit(forcedModuleId);
}

export function markMainTabShuffleSoftCommitInFlightForDiag() {
  const runtime = rt();
  const tx = runtime.activeTx;
  return markSoftCommitTxPinInFlight({
    moduleInstanceId: TRANSITION_MODULE_INSTANCE_ID,
    runtimeInstanceId: runtime.runtimeInstanceId,
    activeTxPresent: Boolean(tx),
  });
}

export function exportMainTabToShuffleTraceRing() {
  return mergeMainTabShuffleTraceRings(traceRing as MainTabShuffleDiagTraceEvent[]);
}

export function exportMainTabToShuffleMetrics() {
  const runtime = rt();
  const tx = runtime.activeTx;
  if (!tx) return null;
  return {
    transactionId: tx.transactionId,
    navSeq: tx.navSeq,
    sourcePath: tx.sourcePath,
    createdMono: tx.createdMono,
    phase: tx.phase,
    source: tx.source,
    direction: tx.direction,
    startedAtMono: tx.startedAtMono,
    destinationReadyAtMono: tx.destinationReadyAtMono,
    slideStartedAtMono: tx.slideStartedAtMono,
    slideEndedAtMono: tx.slideEndedAtMono,
    prepMs:
      tx.destinationReadyAtMono && tx.startedAtMono
        ? tx.destinationReadyAtMono - tx.startedAtMono
        : null,
    slideDurationMs:
      tx.slideEndedAtMono && tx.slideStartedAtMono
        ? tx.slideEndedAtMono - tx.slideStartedAtMono
        : null,
    bridgeStartCount,
    bridgeCompleteCount,
    bridgeFailsafeCount,
    ownershipTransferCount,
    bridgeReadinessSampleCount,
    runtimeInstanceId: getMainTabShufflePresentationRuntimeInstanceId(),
    transitionModuleInstanceId: TRANSITION_MODULE_INSTANCE_ID,
    postSettleBridgeActive: runtime.postSettleBridgeActive,
    presentationLatchNavSeq: runtime.presentationLatchNavSeq,
    bridgeGeneration: runtime.bridgeGeneration,
    bridgeObserverOwnerModuleId: runtime.bridgeObserverOwnerModuleId,
  };
}

bootstrapTransitionModuleLifecycleDiag(
  TRANSITION_MODULE_INSTANCE_ID,
  TRANSITION_MODULE_CREATED_MONO,
);
adoptCanonicalPresentationOnModuleEval(TRANSITION_MODULE_INSTANCE_ID);

if (typeof window !== "undefined") {
  const win = window as unknown as Record<string, unknown>;
  win.__forceSoftPushModuleReinitForTestOnly = forceSoftPushModuleReinitForTestOnly;
  win.__markMainTabShuffleSoftCommitInFlightForDiag = markMainTabShuffleSoftCommitInFlightForDiag;
}
