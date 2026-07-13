"use client";

import { useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";

import {
  exportMainTabToShuffleTraceRing,
  exportPresentationLatchMetrics,
  getActiveSlideFailsafeTimerIdForDiag,
  getMainTabToShufflePhase,
  getMainTabToShufflePresentationLatchNavSeq,
  getMainTabToShuffleTransaction,
  getMainTabToShuffleTransitionVersion,
  getTransitionModuleInstanceIdForDiag,
  isMainTabToShufflePresentationLatchActive,
  isPostSettleRouteBridgeActive,
  resetPresentationLatchMetrics,
  subscribeMainTabToShuffleTransition,
} from "@/lib/navigation/mainTabToShuffleTransition";
import { getShuffleDestinationReadiness } from "@/lib/navigation/shuffleDestinationReadiness";
import {
  exportMainTabShuffleAccumulationCounters,
  flushMainTabShuffleTraceRingToSessionStorage,
  isMainTabShuffleTraceDiagEnabled,
  persistMainTabShuffleTraceEntry,
} from "@/lib/perf/mainTabToShuffleTraceDiag";
import {
  enrichLifecycleDiagEntry,
  installPathnameLifecycleObserver,
  observeHostElement,
  observeStageElement,
} from "@/lib/perf/mainTabShuffleLifecycleDiag";
import {
  emitStageEffectLifecycle,
  isSlideDomWriteDiagEnabled,
} from "@/lib/perf/mainTabShuffleSlideDomWriteDiag";
import { countRestorableWarmFeedSlots } from "@/lib/shuffle/shufflePresentation";

function monoMs() {
  return Math.round(performance.timeOrigin + performance.now());
}

function exportHopStateSnapshot(when: "pre" | "post", hopSequenceId?: string, hopNum?: number) {
  const tx = getMainTabToShuffleTransaction();
  const readiness = getShuffleDestinationReadiness();
  const html = typeof document !== "undefined" ? document.documentElement : null;
  const body = typeof document !== "undefined" ? document.body : null;
  const shuffleHost = typeof document !== "undefined"
    ? document.getElementById("sayittome-shuffle-keepalive-host")
    : null;
  const sourceHost = tx
    ? document.getElementById(`sayittome-main-tab-keepalive-${tx.source}`)
    : null;

  return {
    when,
    hopNum: hopNum ?? null,
    hopSequenceId: hopSequenceId ?? null,
    monoMs: monoMs(),
    activeTx: tx
      ? {
          transactionId: tx.transactionId,
          navSeq: tx.navSeq,
          phase: tx.phase,
          source: tx.source,
          abortReason: tx.abortReason,
        }
      : null,
    transitionModuleInstanceId: getTransitionModuleInstanceIdForDiag(),
    runtimeInstanceId: null,
    navSeqCounter: getMainTabToShuffleTransitionVersion(),
    currentTransactionNavSeq: tx?.navSeq ?? null,
    phase: getMainTabToShufflePhase(),
    presentationLatchActive: isMainTabToShufflePresentationLatchActive(),
    presentationOwner: getMainTabToShufflePresentationLatchNavSeq(),
    postSettleBridgeActive: isPostSettleRouteBridgeActive(),
    stageMounted: Boolean(document?.querySelector("[data-main-tab-shuffle-stage]")),
    slideDatasetValue: html?.getAttribute("data-main-tab-shuffle-slide") ?? null,
    dataPostSettleRouteBridge: html?.getAttribute("data-post-settle-route-bridge") ?? null,
    shuffleSurfaceActive: body?.classList.contains("sayittome-shuffle-surface-active") ?? false,
    mainTabHandoffPending: html?.classList.contains("sayittome-main-tab-handoff-pending") ?? false,
    shuffleHandoffPending: html?.classList.contains("sayittome-shuffle-handoff-pending") ?? false,
    restorableSlots: countRestorableWarmFeedSlots(),
    domSlots: readiness.domSlots ?? readiness.sample?.domSlots ?? 0,
    accumulation: exportMainTabShuffleAccumulationCounters(),
    presentationLatchMetrics: exportPresentationLatchMetrics(),
    hostInstanceId: observeHostElement(shuffleHost),
    sourceSurfaceInstanceId: observeHostElement(sourceHost),
    hostClass: shuffleHost instanceof HTMLElement ? shuffleHost.className : null,
    hostInlineTransform: shuffleHost instanceof HTMLElement ? shuffleHost.style.transform || null : null,
    hostInlineTransition: shuffleHost instanceof HTMLElement ? shuffleHost.style.transition || null : null,
    sourceInlineTransform: sourceHost instanceof HTMLElement ? sourceHost.style.transform || null : null,
    sourceInlineTransition: sourceHost instanceof HTMLElement ? sourceHost.style.transition || null : null,
    slideFailsafeTimerId: getActiveSlideFailsafeTimerIdForDiag(),
  };
}

function persistStageTrace(
  kind: "STAGE_MOUNTED" | "STAGE_UNMOUNTED",
  tx: NonNullable<ReturnType<typeof getMainTabToShuffleTransaction>>,
  stageEl: HTMLDivElement | null,
) {
  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  const sourceHost = document.getElementById(`sayittome-main-tab-keepalive-${tx.source}`);
  const entry = enrichLifecycleDiagEntry({
    kind,
    monoMs: monoMs(),
    navSeq: tx.navSeq,
    pathname: window.location.pathname,
    phase: kind === "STAGE_MOUNTED" ? tx.phase : getMainTabToShufflePhase(),
    source: tx.source,
    direction: tx.direction,
    transactionId: tx.transactionId,
    stageMounted: kind === "STAGE_MOUNTED",
    activeTxPresent: Boolean(getMainTabToShuffleTransaction()),
    presentationLatchActive: isMainTabToShufflePresentationLatchActive(),
    presentationOwner: getMainTabToShufflePresentationLatchNavSeq(),
    slideDatasetValue: document.documentElement.getAttribute("data-main-tab-shuffle-slide"),
    restorableSlots: countRestorableWarmFeedSlots(),
    domSlots: getShuffleDestinationReadiness().domSlots ?? 0,
    stageInstanceId: observeStageElement(stageEl),
    shuffleHostInstanceId: observeHostElement(shuffleHost),
    sourceSurfaceInstanceId: observeHostElement(sourceHost),
    destinationSurfaceInstanceId: observeHostElement(shuffleHost),
  });
  persistMainTabShuffleTraceEntry(entry);
}

export default function MainTabToShuffleSlideStage() {
  const stageRef = useRef<HTMLDivElement | null>(null);

  useSyncExternalStore(
    subscribeMainTabToShuffleTransition,
    () => (getMainTabToShuffleTransaction()?.navSeq ?? 0) + getMainTabToShufflePhase().length,
    () => (getMainTabToShuffleTransaction()?.navSeq ?? 0) + getMainTabToShufflePhase().length,
  );

  const phase = getMainTabToShufflePhase();
  const tx = getMainTabToShuffleTransaction();
  const active = phase !== "idle";

  useEffect(() => {
    const win = window as Window & {
      __mainTabToShuffleTraceExport?: typeof exportMainTabToShuffleTraceRing;
      __mainTabShuffleTraceFlush?: typeof flushMainTabShuffleTraceRingToSessionStorage;
      __sayittomePresentationLatch?: {
        export: typeof exportPresentationLatchMetrics;
        reset: typeof resetPresentationLatchMetrics;
      };
      __mainTabToShuffleHopSnapshot?: typeof exportHopStateSnapshot;
      __mainTabToShuffleTxExport?: () => ReturnType<typeof getMainTabToShuffleTransaction>;
    };

    win.__mainTabToShuffleTraceExport = exportMainTabToShuffleTraceRing;
    win.__mainTabShuffleTraceFlush = flushMainTabShuffleTraceRingToSessionStorage;
    win.__sayittomePresentationLatch = {
      export: exportPresentationLatchMetrics,
      reset: resetPresentationLatchMetrics,
    };
    win.__mainTabToShuffleHopSnapshot = exportHopStateSnapshot;
    win.__mainTabToShuffleTxExport = getMainTabToShuffleTransaction;
  }, []);

  useEffect(() => {
    if (!isMainTabShuffleTraceDiagEnabled()) return;
    installPathnameLifecycleObserver(() => {
      const current = getMainTabToShuffleTransaction();
      const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
      const sourceHost = current
        ? document.getElementById(`sayittome-main-tab-keepalive-${current.source}`)
        : null;
      return {
        transactionId: current?.transactionId ?? null,
        phase: getMainTabToShufflePhase(),
        navSeq: current?.navSeq ?? 0,
        shuffleHostInstanceId: observeHostElement(shuffleHost),
        stageInstanceId: observeStageElement(stageRef.current),
        sourceSurfaceInstanceId: observeHostElement(sourceHost),
        destinationSurfaceInstanceId: observeHostElement(shuffleHost),
        slideFailsafeTimerId: getActiveSlideFailsafeTimerIdForDiag(),
        presentationLatchActive: isMainTabToShufflePresentationLatchActive(),
        presentationLatchNavSeq: getMainTabToShufflePresentationLatchNavSeq(),
        postSettleBridgeActive: isPostSettleRouteBridgeActive(),
      };
    });
  }, []);

  useEffect(() => {
    if (!active || !tx || !isMainTabShuffleTraceDiagEnabled()) return;

    const canonicalPhase = getMainTabToShufflePhase();
    const datasetBefore = document.documentElement.getAttribute("data-main-tab-shuffle-slide");
    const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
    if (isSlideDomWriteDiagEnabled()) {
      emitStageEffectLifecycle({
        kind: "STAGE_EFFECT_ENTER",
        transactionId: tx.transactionId,
        phaseProp: phase,
        canonicalPhase,
        datasetSlideStateBefore: datasetBefore,
        writerId: null,
        hostInstanceId: observeHostElement(shuffleHost),
        stageInstanceId: observeStageElement(stageRef.current),
        navSeq: tx.navSeq,
      });
      emitStageEffectLifecycle({
        kind: "STAGE_EFFECT_APPLY_PHASE_STATE",
        transactionId: tx.transactionId,
        phaseProp: phase,
        canonicalPhase,
        datasetSlideStateBefore: datasetBefore,
        writerId: "stage-render-only",
        hostInstanceId: observeHostElement(shuffleHost),
        stageInstanceId: observeStageElement(stageRef.current),
        navSeq: tx.navSeq,
      });
    }

    persistStageTrace("STAGE_MOUNTED", tx, stageRef.current);

    return () => {
      if (isSlideDomWriteDiagEnabled()) {
        emitStageEffectLifecycle({
          kind: "STAGE_EFFECT_CLEANUP",
          transactionId: tx.transactionId,
          phaseProp: phase,
          canonicalPhase: getMainTabToShufflePhase(),
          datasetSlideStateBefore: document.documentElement.getAttribute("data-main-tab-shuffle-slide"),
          writerId: null,
          hostInstanceId: observeHostElement(shuffleHost),
          stageInstanceId: observeStageElement(stageRef.current),
          navSeq: tx.navSeq,
        });
      }
      persistStageTrace("STAGE_UNMOUNTED", tx, stageRef.current);
    };
  }, [active, tx?.navSeq, tx?.phase, tx?.source, tx?.direction, tx?.transactionId, phase]);

  if (!active || !tx) return null;

  return (
    <div
      ref={stageRef}
      data-main-tab-shuffle-stage
      data-main-tab-shuffle-stage-phase={phase}
      data-main-tab-shuffle-stage-nav-seq={tx.navSeq}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
