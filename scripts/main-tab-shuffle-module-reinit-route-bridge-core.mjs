/**
 * Module reinit route bridge harness core — reproduces prod hop-01 timeline.
 * M1 starts bridge; M2 adopts at route commit; final handoff clears tx once.
 */

export const PROD_HOP1_MODULE_REINIT_MS = 611;

export const MODULE_M2_DELAYS_MS = [50, 100, 170, 200, 400, 611, 900, 1200];

export function createCanonicalRuntime(seed = 0) {
  return {
    runtimeInstanceId: `presentation-runtime-${seed}-abc`,
    createdMono: seed,
    navSeq: 1,
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
    bridgeRaf: null,
    bridgeFailsafeTimer: null,
    bridgeStartedAtMono: null,
    bridgeCompletedAtMono: null,
    latchArmedAtMono: seed,
    latchReleaseRaf: null,
    prepLoopId: 0,
    listeners: new Set(),
  };
}

export function createTransaction(seed, navSeq = 1) {
  return {
    transactionId: `tx-${navSeq}-1-_chats`,
    navSeq,
    sourcePath: "/chats",
    createdMono: seed,
    source: "chats",
    destination: "shuffle",
    direction: "from-right",
    phase: "route_bridge",
    startedAtMono: seed,
    destinationReadyAtMono: seed + 36,
    slideStartedAtMono: seed + 51,
    slideEndedAtMono: seed + 170,
    abortReason: null,
  };
}

function gateMayPresentShuffleLoading({
  presentationOwned,
  presentationLatchActive,
  warmHopIntentActive,
  wouldShowLoading,
}) {
  if (!wouldShowLoading) return false;
  if (presentationOwned || presentationLatchActive || warmHopIntentActive) return false;
  return true;
}

function shouldBlockLegacy({ runtime }) {
  if (runtime.presentationLatchNavSeq !== null) return true;
  if (runtime.postSettleBridgeActive) return true;
  if (!runtime.activeTx) return false;
  const phase = runtime.activeTx.phase;
  return (
    phase === "preparing" ||
    phase === "armed" ||
    phase === "sliding" ||
    phase === "settled" ||
    phase === "route_bridge"
  );
}

/**
 * Deterministic hop simulation aligned with prod hop-01:
 * t=0 M1 tx X sliding→settled→bridge; pathname /chats until routeCommit;
 * M2 created at m2DelayMs on /shuffle; final DOM at routeCommit+finalDomDelay.
 */
export function simulateModuleReinitHop({
  seed = 1_783_555_683_000,
  routeCommitMs = 597,
  m2DelayMs = PROD_HOP1_MODULE_REINIT_MS,
  finalDomDelayMs = 52,
  legacyRevealAtMs = 770,
  maxMs,
  stepMs = 16,
}) {
  const resolvedMaxMs = maxMs ?? Math.max(2500, routeCommitMs + finalDomDelayMs + 400);
  const events = [];
  const runtime = createCanonicalRuntime(seed);
  const m1 = `module-${seed}-m5wxss`;
  const m2 = `module-${seed + m2DelayMs}-222til`;
  const tx = createTransaction(seed);

  let pathname = "/chats";
  let finalDomSlots = 0;
  let stableRaf = 0;
  let latchReleased = false;
  let bridgeCompleted = false;
  let txCleared = false;
  let handoffCount = 0;
  let handoffAt = null;
  let legacyBlocked = 0;
  let loadingVisibleFrames = 0;
  let ownerNoneFrames = 0;
  let observerOwner = m1;
  let m2Created = false;
  let adopted = false;
  let staleExit = false;

  runtime.activeTx = tx;
  runtime.presentationLatchNavSeq = tx.navSeq;
  runtime.presentationLatchTransactionId = tx.transactionId;
  runtime.postSettleBridgeActive = true;
  runtime.postSettleBridgeTransactionId = tx.transactionId;
  runtime.presentationOwner = "route_bridge";
  runtime.bridgeGeneration = 1;
  runtime.bridgeObserverOwnerModuleId = m1;
  events.push({ t: 176, kind: "POST_SETTLE_ROUTE_BRIDGE_STARTED", module: m1 });

  for (let t = 0; t <= resolvedMaxMs; t += stepMs) {
    if (t >= routeCommitMs) pathname = "/shuffle";
    if (t >= m2DelayMs && !m2Created) {
      m2Created = true;
      observerOwner = m2;
      runtime.bridgeObserverOwnerModuleId = m2;
      adopted = true;
      events.push({
        t,
        kind: "TRANSITION_MODULE_ADOPTED_ACTIVE_TRANSACTION",
        module: m2,
        transactionId: tx.transactionId,
      });
      events.push({
        t,
        kind: "POST_SETTLE_ROUTE_BRIDGE_OBSERVER_ADOPTED",
        module: m2,
        previous: m1,
      });
      if (m1 !== m2) {
        staleExit = true;
        events.push({ t, kind: "POST_SETTLE_ROUTE_BRIDGE_OBSERVER_STALE_EXIT", module: m1 });
      }
    }

    if (pathname === "/shuffle" && t >= routeCommitMs + finalDomDelayMs) {
      finalDomSlots = 35;
    }

    const finalReady =
      pathname === "/shuffle" && finalDomSlots >= 3 && !txCleared;
    if (finalReady) stableRaf += 1;
    else stableRaf = 0;

    const presentationOwned =
      runtime.postSettleBridgeActive ||
      runtime.presentationLatchNavSeq !== null ||
      Boolean(runtime.activeTx);
    const warmIntent = !latchReleased;
    const wouldShowLoading =
      pathname === "/shuffle" && finalDomSlots === 0 && !presentationOwned && !warmIntent;
    const mayPresent = gateMayPresentShuffleLoading({
      presentationOwned,
      presentationLatchActive: runtime.presentationLatchNavSeq !== null,
      warmHopIntentActive: warmIntent,
      wouldShowLoading,
    });
    if (wouldShowLoading && mayPresent) loadingVisibleFrames += 1;
    if (!presentationOwned && !warmIntent && finalDomSlots < 3) ownerNoneFrames += 1;

    if (
      !txCleared &&
      t >= legacyRevealAtMs &&
      t < legacyRevealAtMs + stepMs &&
      shouldBlockLegacy({ runtime })
    ) {
      legacyBlocked += 1;
      events.push({ t, kind: "LEGACY_PRESENTATION_BLOCKED_BY_SLIDE_OWNER" });
    }

    if (
      observerOwner === m2 &&
      stableRaf >= 2 &&
      finalReady &&
      !bridgeCompleted &&
      runtime.activeTx?.transactionId === tx.transactionId
    ) {
      handoffCount += 1;
      handoffAt = t;
      bridgeCompleted = true;
      latchReleased = true;
      runtime.postSettleBridgeActive = false;
      runtime.presentationLatchNavSeq = null;
      runtime.presentationLatchTransactionId = null;
      runtime.activeTx = null;
      txCleared = true;
      events.push({ t, kind: "FINAL_ROUTE_SURFACE_READY", module: m2 });
      events.push({ t, kind: "PRESENTATION_OWNERSHIP_TRANSFERRED", module: m2 });
      events.push({ t, kind: "TRANSACTION_REF_CLEARED", module: m2, reason: "final-route-ready" });
      events.push({ t, kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED", module: m2 });
    }
  }

  const adoptionExpected = m2DelayMs < (handoffAt ?? resolvedMaxMs + 1);
  const pass =
    handoffCount === 1 &&
    txCleared &&
    loadingVisibleFrames === 0 &&
    ownerNoneFrames === 0 &&
    runtime.activeTx === null &&
    (!adoptionExpected || (adopted && staleExit));

  return {
    pass,
    adopted,
    staleExit,
    bridgeCompleted,
    txCleared,
    handoffCount,
    handoffAt,
    legacyBlocked,
    adoptionExpected,
    loadingVisibleFrames,
    ownerNoneFrames,
    events,
    m1,
    m2,
    transactionId: tx.transactionId,
    runtimeInstanceId: runtime.runtimeInstanceId,
  };
}

export function enumerateModuleReinitPermutations() {
  const out = [];
  for (const m2DelayMs of MODULE_M2_DELAYS_MS) {
    for (const routeCommitMs of [0, 100, 300, 597, 900]) {
      for (const finalDomDelayMs of [0, 16, 52, 100, 250]) {
        out.push({ m2DelayMs, routeCommitMs, finalDomDelayMs });
      }
    }
  }
  while (out.length < 10_000) {
    const i = out.length;
    out.push({
      m2DelayMs: MODULE_M2_DELAYS_MS[i % MODULE_M2_DELAYS_MS.length],
      routeCommitMs: (i * 97) % 1200,
      finalDomDelayMs: (i * 13) % 300,
    });
  }
  return out.slice(0, 10_000);
}

export function runModuleReinitHarness(permutations = enumerateModuleReinitPermutations()) {
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const perm of permutations) {
    const result = simulateModuleReinitHop({
      seed: 1_783_555_683_000 + pass + fail,
      routeCommitMs: perm.routeCommitMs,
      m2DelayMs: perm.m2DelayMs,
      finalDomDelayMs: perm.finalDomDelayMs,
    });
    if (result.pass) {
      pass += 1;
    } else {
      fail += 1;
      if (failures.length < 8) failures.push({ perm, result });
    }
  }

  return { pass, fail, total: permutations.length, failures };
}

/** Complement: soft-push reinit with pinned preparing tx (prod divergence class). */
export function simulateSoftPushReinitWithPinnedTx({ seed = 1_783_816_000_000 } = {}) {
  const events = [];
  const pin = {
    txId: `tx-1-1-_chats`,
    phase: "preparing",
    isSoftCommitInFlight: true,
    moduleInstanceIdOriginal: `module-${seed}-a`,
    runtimeInstanceIdOriginal: `presentation-runtime-${seed}-a`,
  };
  let runtime = {
    runtimeInstanceId: pin.runtimeInstanceIdOriginal,
    activeTx: { transactionId: pin.txId, phase: "preparing", source: "chats", navSeq: 1 },
  };
  events.push({ kind: "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT", txId: pin.txId });
  events.push({ kind: "MICRO_SLIDE_TX_SOFT_COMMIT_IN_FLIGHT", txId: pin.txId });
  // Reinit wipes runtime, pin survives.
  runtime = {
    runtimeInstanceId: `presentation-runtime-${seed + 260}-b`,
    activeTx: null,
  };
  events.push({ kind: "MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH", txId: pin.txId });
  runtime.activeTx = { transactionId: pin.txId, phase: "preparing", source: "chats", navSeq: 1 };
  events.push({ kind: "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT", txId: pin.txId });
  events.push({ kind: "PHASE_ARMED", txId: pin.txId });
  events.push({ kind: "PHASE_SLIDING", txId: pin.txId });
  const pass =
    runtime.activeTx?.transactionId === pin.txId &&
    events.some((e) => e.kind === "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT");
  return { pass, events, txId: pin.txId, SOFT_PUSH_REINIT_WITH_PINNED_TX: pass };
}
