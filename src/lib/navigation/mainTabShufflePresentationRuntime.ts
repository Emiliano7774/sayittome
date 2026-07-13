import type { MainTabToShuffleTransaction } from "@/lib/navigation/mainTabToShuffleTransition";
import {
  emitLifecycleDiag,
  isMainTabShuffleLifecycleDiagEnabled,
} from "@/lib/perf/mainTabShuffleLifecycleDiag";

export type PresentationOwnerKind = "none" | "slide" | "route_bridge" | "final_route";

export type MainTabShufflePresentationRuntime = {
  runtimeVersion: 1;
  runtimeInstanceId: string;
  createdMono: number;

  navSeq: number;
  activeTx: MainTabToShuffleTransaction | null;

  presentationLatchNavSeq: number | null;
  presentationLatchTransactionId: string | null;

  postSettleBridgeActive: boolean;
  postSettleBridgeTransactionId: string | null;

  presentationOwner: PresentationOwnerKind;

  bridgeGeneration: number;
  bridgeObserverOwnerModuleId: string | null;

  /** @deprecated Prefer slideEndWatchdogHandle — kept as alias for diag readers. */
  slideFailSafeTimer: ReturnType<typeof setTimeout> | null;
  /** @deprecated Prefer slideEndWatchdogId / slidePreWriteWatchdogId. */
  activeSlideFailsafeTimerId: string | null;
  /** @deprecated Prefer watchdog scheduled-tx fields. */
  activeSlideFailsafeScheduledTransactionId: string | null;

  slidePreWriteWatchdogHandle: ReturnType<typeof setTimeout> | null;
  slidePreWriteWatchdogId: string | null;
  slidePreWriteWatchdogScheduledTransactionId: string | null;

  slidePostWritePreStartWatchdogHandle: ReturnType<typeof setTimeout> | null;
  slidePostWritePreStartWatchdogId: string | null;
  slidePostWritePreStartWatchdogScheduledTransactionId: string | null;

  sourceTransitionStartedMono: number | null;
  destinationTransitionStartedMono: number | null;
  slideTransitionStartedMono: number | null;

  slideEndWatchdogHandle: ReturnType<typeof setTimeout> | null;
  slideEndWatchdogId: string | null;
  slideEndWatchdogScheduledTransactionId: string | null;
  slideFinalWriteCommittedMono: number | null;

  bridgeRaf: number | null;
  bridgeFailsafeTimer: ReturnType<typeof setTimeout> | null;
  bridgeStartedAtMono: number | null;
  bridgeCompletedAtMono: number | null;

  latchArmedAtMono: number | null;
  latchReleaseRaf: number | null;
  prepLoopId: number;

  /** Diagnostic-only tracking of the final-write RAF handle/sequence. Not used for motor control. */
  diagFinalWriteRafHandle: number | null;
  diagFinalWriteRafSequence: string | null;

  listeners: Set<() => void>;
};

const RUNTIME_GLOBAL_KEY = Symbol.for("sayittome.main-tab-shuffle-presentation-runtime.v1");

/** Stale recovery only for abandoned txs — never during normal module reinit adoption. */
const STALE_TX_TTL_MS = 30_000;

type GlobalWithRuntime = typeof globalThis & {
  [key: symbol]: MainTabShufflePresentationRuntime | undefined;
};

function monoMs() {
  if (typeof performance === "undefined") return 0;
  return Math.round(performance.timeOrigin + performance.now());
}

function newRuntimeInstanceId(createdMono: number) {
  return `presentation-runtime-${createdMono}-${Math.random().toString(36).slice(2, 8)}`;
}

function createFreshRuntime(): MainTabShufflePresentationRuntime {
  const createdMono = monoMs();
  return {
    runtimeVersion: 1,
    runtimeInstanceId: newRuntimeInstanceId(createdMono),
    createdMono,
    navSeq: 0,
    activeTx: null,
    presentationLatchNavSeq: null,
    presentationLatchTransactionId: null,
    postSettleBridgeActive: false,
    postSettleBridgeTransactionId: null,
    presentationOwner: "none",
    bridgeGeneration: 0,
    bridgeObserverOwnerModuleId: null,
    slideFailSafeTimer: null,
    activeSlideFailsafeTimerId: null,
    activeSlideFailsafeScheduledTransactionId: null,
    slidePreWriteWatchdogHandle: null,
    slidePreWriteWatchdogId: null,
    slidePreWriteWatchdogScheduledTransactionId: null,
    slidePostWritePreStartWatchdogHandle: null,
    slidePostWritePreStartWatchdogId: null,
    slidePostWritePreStartWatchdogScheduledTransactionId: null,
    sourceTransitionStartedMono: null,
    destinationTransitionStartedMono: null,
    slideTransitionStartedMono: null,
    slideEndWatchdogHandle: null,
    slideEndWatchdogId: null,
    slideEndWatchdogScheduledTransactionId: null,
    slideFinalWriteCommittedMono: null,
    bridgeRaf: null,
    bridgeFailsafeTimer: null,
    bridgeStartedAtMono: null,
    bridgeCompletedAtMono: null,
    latchArmedAtMono: null,
    latchReleaseRaf: null,
    prepLoopId: 0,
    diagFinalWriteRafHandle: null,
    diagFinalWriteRafSequence: null,
    listeners: new Set(),
  };
}

export function getMainTabShufflePresentationRuntime(): MainTabShufflePresentationRuntime {
  const g = globalThis as GlobalWithRuntime;
  let runtime = g[RUNTIME_GLOBAL_KEY];
  if (!runtime) {
    runtime = createFreshRuntime();
    g[RUNTIME_GLOBAL_KEY] = runtime;
    if (isMainTabShuffleLifecycleDiagEnabled()) {
      emitLifecycleDiag({
        kind: "PRESENTATION_RUNTIME_CREATED",
        runtimeInstanceId: runtime.runtimeInstanceId,
        note: `createdMono=${runtime.createdMono}`,
      });
    }
  }
  return runtime;
}

export function notePresentationRuntimeReusedForDiag() {
  if (!isMainTabShuffleLifecycleDiagEnabled()) return;
  const runtime = getMainTabShufflePresentationRuntime();
  emitLifecycleDiag({
    kind: "PRESENTATION_RUNTIME_REUSED",
    runtimeInstanceId: runtime.runtimeInstanceId,
    note: `createdMono=${runtime.createdMono}`,
  });
}

export function getMainTabShufflePresentationRuntimeInstanceId(): string {
  return getMainTabShufflePresentationRuntime().runtimeInstanceId;
}

export function ownsCanonicalPresentationPhase(
  phase: MainTabToShuffleTransaction["phase"] | "idle",
): boolean {
  return (
    phase === "preparing" ||
    phase === "armed" ||
    phase === "sliding" ||
    phase === "settled" ||
    phase === "route_bridge"
  );
}

export function syncPresentationOwnerFromState(runtime: MainTabShufflePresentationRuntime) {
  if (runtime.postSettleBridgeActive && runtime.activeTx?.phase === "route_bridge") {
    runtime.presentationOwner = "route_bridge";
    return;
  }
  if (runtime.activeTx && ownsCanonicalPresentationPhase(runtime.activeTx.phase)) {
    runtime.presentationOwner = "slide";
    return;
  }
  if (runtime.presentationLatchNavSeq !== null) {
    runtime.presentationOwner = "slide";
    return;
  }
  if (runtime.presentationOwner === "final_route") return;
  runtime.presentationOwner = "none";
}

/**
 * Recover only truly abandoned canonical state — never a live route_bridge awaiting adoption.
 */
export function maybeRecoverStaleCanonicalRuntime(nowMono = monoMs()) {
  const runtime = getMainTabShufflePresentationRuntime();
  const tx = runtime.activeTx;
  if (!tx) return false;

  const ageMs = nowMono - tx.createdMono;
  if (ageMs < STALE_TX_TTL_MS) return false;

  const hasLiveOwnership =
    runtime.presentationLatchNavSeq !== null ||
    runtime.postSettleBridgeActive ||
    runtime.bridgeObserverOwnerModuleId !== null ||
    ownsCanonicalPresentationPhase(tx.phase);

  if (hasLiveOwnership && tx.phase === "route_bridge") return false;

  runtime.activeTx = null;
  runtime.presentationLatchNavSeq = null;
  runtime.presentationLatchTransactionId = null;
  runtime.postSettleBridgeActive = false;
  runtime.postSettleBridgeTransactionId = null;
  runtime.presentationOwner = "none";
  runtime.bridgeObserverOwnerModuleId = null;
  return true;
}

export function resetMainTabShufflePresentationRuntimeForTests() {
  const g = globalThis as GlobalWithRuntime;
  delete g[RUNTIME_GLOBAL_KEY];
}
