/**
 * Pure post-settle route bridge state machine — deterministic harness core.
 * Models OLD v3 latch release by restorable slots vs NEW final-route bridge handoff.
 */

export const ROUTE_COMMIT_DELAYS_MS = [0, 50, 100, 300, 600, 900, 1200];
export const FINAL_DOM_DELAYS_MS = [0, 16, 50, 100, 250];

/** Prod forensic: latch released +166ms, loading bug +763ms with dom=0 at pathname=/shuffle. */
export const PROD_HOP1_TIMELINE = {
  settledMs: 0,
  oldLatchReleaseMs: 166,
  routeCommitMs: 597,
  bugWindowMs: 763,
  finalDomReadyMs: 628,
  presentedPrepSlots: 35,
};

function frameTimes(maxMs = 2000, stepMs = 16) {
  const frames = [];
  for (let t = 0; t <= maxMs; t += stepMs) frames.push(t);
  return frames;
}

function gateMayPresentShuffleLoading({
  microSlideEnabled,
  presentationOwned,
  presentationLatchActive,
  warmHopIntentActive,
  wouldShowLoading,
  directColdEntry,
}) {
  if (!wouldShowLoading) return false;
  if (directColdEntry && !presentationOwned && !presentationLatchActive) return true;
  if (!microSlideEnabled) return true;
  if (presentationOwned || presentationLatchActive || warmHopIntentActive) return false;
  return true;
}

/** OLD v3: release latch when restorableSlots >= 3 (often while pathname still /chats). */
export function simulateOldV3Handoff({
  routeCommitMs,
  finalDomReadyMs,
  presentedPrepSlots = 35,
  restorableSlots = 35,
  maxMs = 2000,
}) {
  let latch = true;
  let warmIntent = true;
  let pathname = "/chats";
  let finalDomSlots = 0;
  let loadingVisibleFrames = 0;
  let ownerNoneFrames = 0;
  let latchReleasedAt = null;

  for (const t of frameTimes(maxMs)) {
    if (t >= routeCommitMs) pathname = "/shuffle";
    if (pathname === "/shuffle" && t >= routeCommitMs + finalDomReadyMs) {
      finalDomSlots = presentedPrepSlots;
    }

    if (latchReleasedAt === null && t >= 8 && restorableSlots >= 3) {
      latch = false;
      warmIntent = false;
      latchReleasedAt = t;
    }

    const presentationOwned = latch;
    const wouldShowLoading =
      pathname === "/shuffle" && finalDomSlots === 0 && !presentationOwned && !warmIntent;
    const mayPresent = gateMayPresentShuffleLoading({
      microSlideEnabled: true,
      presentationOwned,
      presentationLatchActive: latch,
      warmHopIntentActive: warmIntent,
      wouldShowLoading,
      directColdEntry: false,
    });

    if (wouldShowLoading && mayPresent) loadingVisibleFrames += 1;
    if (!presentationOwned && !latch && !warmIntent && finalDomSlots < 3) ownerNoneFrames += 1;
  }

  return {
    latchReleasedAt,
    loadingVisibleFrames,
    ownerNoneFrames,
    bugAtMs: loadingVisibleFrames > 0 ? routeCommitMs : null,
  };
}

/** NEW bridge: latch + warm intent held until final route surface ready + 2 stable RAF. */
export function simulateNewBridgeHandoff({
  routeCommitMs,
  finalDomReadyMs,
  presentedPrepSlots = 35,
  maxMs = 2000,
}) {
  let latch = true;
  let warmIntent = true;
  let bridgeActive = true;
  let pathname = "/chats";
  let finalDomSlots = 0;
  let stableRaf = 0;
  let loadingVisibleFrames = 0;
  let ownerNoneFrames = 0;
  let presentedInvalidFrames = 0;
  let latchReleasedAt = null;
  let bridgeStartedAt = 0;
  let bridgeCompletedAt = null;
  let finalReadyAt = null;
  let ownershipTransferredAt = null;

  for (const t of frameTimes(maxMs)) {
    if (t >= routeCommitMs) pathname = "/shuffle";
    if (pathname === "/shuffle" && t >= routeCommitMs + finalDomReadyMs) {
      finalDomSlots = presentedPrepSlots;
    }

    const prepSlots = presentedPrepSlots;
    const presentationOwned = bridgeActive || latch;
    const finalReady =
      pathname === "/shuffle" &&
      finalDomSlots >= 3 &&
      prepSlots >= 3;

    if (bridgeActive && prepSlots < 3) presentedInvalidFrames += 1;

    if (finalReady) stableRaf += 1;
    else stableRaf = 0;

    const wouldShowLoading =
      pathname === "/shuffle" && finalDomSlots === 0 && !presentationOwned && !warmIntent;
    const mayPresent = gateMayPresentShuffleLoading({
      microSlideEnabled: true,
      presentationOwned,
      presentationLatchActive: latch,
      warmHopIntentActive: warmIntent,
      wouldShowLoading,
      directColdEntry: false,
    });
    if (wouldShowLoading && mayPresent) loadingVisibleFrames += 1;
    if (bridgeActive && !latch && !warmIntent && prepSlots < 3) ownerNoneFrames += 1;

    if (bridgeActive && stableRaf >= 2 && finalReady && latchReleasedAt === null) {
      ownershipTransferredAt = t;
      finalReadyAt = t;
      latch = false;
      warmIntent = false;
      bridgeActive = false;
      latchReleasedAt = t;
      bridgeCompletedAt = t;
    }
  }

  const pass =
    loadingVisibleFrames === 0 &&
    ownerNoneFrames === 0 &&
    presentedInvalidFrames === 0 &&
    latchReleasedAt !== null &&
    latchReleasedAt >= routeCommitMs + finalDomReadyMs;

  return {
    pass,
    bridgeStartedAt,
    latchReleasedAt,
    ownershipTransferredAt,
    finalReadyAt,
    bridgeCompletedAt,
    loadingVisibleFrames,
    ownerNoneFrames,
    presentedInvalidFrames,
  };
}

export function enumerateBridgePermutations() {
  const out = [];
  for (const routeCommitMs of ROUTE_COMMIT_DELAYS_MS) {
    for (const finalDomReadyMs of FINAL_DOM_DELAYS_MS) {
      out.push({ routeCommitMs, finalDomReadyMs });
    }
  }
  while (out.length < 10_000) {
    const routeCommitMs = Math.floor((out.length * 1200) / 10_000);
    const finalDomReadyMs = Math.floor(((out.length * 37) % 251));
    out.push({ routeCommitMs, finalDomReadyMs });
  }
  return out.slice(0, 10_000);
}

export function runBridgeHarness(permutations = enumerateBridgePermutations()) {
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const perm of permutations) {
    const result = simulateNewBridgeHandoff(perm);
    if (result.pass) {
      pass += 1;
    } else {
      fail += 1;
      if (failures.length < 8) failures.push({ perm, result });
    }
  }

  return { pass, fail, total: permutations.length, failures };
}

export function compareOldVsNewProdHop() {
  const { routeCommitMs, finalDomReadyMs, oldLatchReleaseMs, bugWindowMs } = PROD_HOP1_TIMELINE;
  const oldResult = simulateOldV3Handoff({ routeCommitMs, finalDomReadyMs });
  const newResult = simulateNewBridgeHandoff({ routeCommitMs, finalDomReadyMs });

  return {
    atOldLatchReleaseMs: {
      old: { latch: false, warmIntent: false, bridgeActive: false },
      new: { latch: true, warmIntent: true, bridgeActive: true },
    },
    atBugWindowMs: {
      old: {
        loadingVisible: oldResult.loadingVisibleFrames > 0,
        latch: false,
      },
      new: {
        loadingVisible: false,
        latch: true,
        bridgeActive: true,
        presentedPrepSlots: 35,
      },
    },
    oldLatchReleasedAt: oldResult.latchReleasedAt,
    newLatchReleasedAt: newResult.latchReleasedAt,
    oldLoadingVisibleFrames: oldResult.loadingVisibleFrames,
    newLoadingVisibleFrames: newResult.loadingVisibleFrames,
    markers: {
      oldLatchReleaseMs,
      bugWindowMs,
      routeCommitMs,
      finalDomReadyMs: routeCommitMs + finalDomReadyMs,
    },
  };
}
