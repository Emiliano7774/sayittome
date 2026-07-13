/**
 * Route-bridge owner surface presentation — deterministic harness core.
 * Models OLD settle→bridge gap (prep hidden while presentationOwner=route_bridge)
 * vs NEW atomic bridge-owner visibility.
 */

export const ROUTE_BRIDGE_ROUTE_DELAYS_MS = [0, 100, 300, 600, 1000, 2000, 2645, 3584, 4500];
export const ROUTE_BRIDGE_FINAL_DOM_DELAYS_MS = [0, 16, 50, 100, 250, 500];

export const HOP2_SETTLED_MS = 303;
export const HOP2_BRIDGE_START_MS = 353;
export const HOP1_ROUTE_DELAY_MS = 2645;
export const HOP2_ROUTE_DELAY_MS = 3584;

function frameTimes(maxMs = 5000, stepMs = 16) {
  const frames = [];
  for (let t = 0; t <= maxMs; t += stepMs) frames.push(t);
  return frames;
}

function hostPresentable(state) {
  if (!state.hostMounted) return { ok: false, reason: "host-not-mounted" };
  if (state.visibility !== "visible") return { ok: false, reason: "visibility-hidden" };
  if (state.opacity <= 0) return { ok: false, reason: "opacity-zero" };
  if (state.zIndex < 0) return { ok: false, reason: "z-index-behind" };
  if (state.rectW <= 0 || state.rectH <= 0) return { ok: false, reason: "invalid-rect" };
  if (state.visibleSlots < 3) return { ok: false, reason: "slots-lt-3" };
  if (state.loadingShellVisible > 0) return { ok: false, reason: "loading-visible" };
  return { ok: true, reason: null };
}

/** OLD: clearSlideDomState hides prep before bridge CSS can present owner. */
export function simulateOldSettleToBridge({
  settledMs = HOP2_SETTLED_MS,
  bridgeStartMs = HOP2_BRIDGE_START_MS,
  routeCommitMs = HOP2_ROUTE_DELAY_MS,
  finalDomReadyMs = 0,
  presentedPrepSlots = 35,
  maxMs = 5000,
}) {
  let presentationOwner = "slide";
  let bridgeActive = false;
  let pathname = "/chats";
  let bridgeOwnerNotPresentable = 0;
  let firstInvalidMono = null;
  let firstInvalidReason = null;
  let prepHiddenBeforeFinalReady = 0;
  let finalDomSlots = 0;
  let ownershipTransferred = false;

  for (const t of frameTimes(maxMs)) {
    if (t >= settledMs) presentationOwner = "settled";
    if (t >= bridgeStartMs) {
      presentationOwner = "route_bridge";
      bridgeActive = true;
    }
    if (t >= routeCommitMs) pathname = "/shuffle";
    if (pathname === "/shuffle" && t >= routeCommitMs + finalDomReadyMs) {
      finalDomSlots = presentedPrepSlots;
    }
    if (finalDomSlots >= 3 && t >= routeCommitMs + finalDomReadyMs + 32) {
      ownershipTransferred = true;
      presentationOwner = "final_route";
    }

    const slideActive = t >= settledMs - 16 && t < bridgeStartMs;
    const hostMounted = true;
    const visibleSlots = presentedPrepSlots;

    let visibility = "visible";
    let opacity = 1;
    let zIndex = 1;
    let rectW = 390;
    let rectH = 844;
    let loadingShellVisible = 0;

    if (bridgeActive && !ownershipTransferred) {
      // OLD: after bridge start, prep host returns to frozen hidden (no bridge-owner CSS).
      if (!slideActive) {
        visibility = "hidden";
        opacity = 0;
        zIndex = -1;
      }
    }

    const state = {
      hostMounted,
      visibility,
      opacity,
      zIndex,
      rectW,
      rectH,
      visibleSlots,
      loadingShellVisible,
    };

    if (bridgeActive && !ownershipTransferred && presentationOwner === "route_bridge") {
      const check = hostPresentable(state);
      if (!check.ok) {
        bridgeOwnerNotPresentable += 1;
        if (firstInvalidMono == null) {
          firstInvalidMono = t;
          firstInvalidReason = check.reason;
        }
        if (!ownershipTransferred && finalDomSlots < 3) prepHiddenBeforeFinalReady += 1;
      }
    }
  }

  return {
    bridgeOwnerNotPresentableFrameCount: bridgeOwnerNotPresentable,
    bridgeOwnerFirstInvalidMono: firstInvalidMono,
    bridgeOwnerFirstInvalidReason: firstInvalidReason,
    prepHiddenBeforeFinalReady,
  };
}

/** NEW: bridge owner state applied before animation cleanup removes slide-active. */
export function simulateNewSettleToBridge({
  settledMs = HOP2_SETTLED_MS,
  bridgeStartMs = HOP2_BRIDGE_START_MS,
  routeCommitMs = HOP2_ROUTE_DELAY_MS,
  finalDomReadyMs = 0,
  presentedPrepSlots = 35,
  maxMs = 5000,
}) {
  let presentationOwner = "slide";
  let bridgeActive = false;
  let pathname = "/chats";
  let bridgeOwnerNotPresentable = 0;
  let firstInvalidMono = null;
  let firstInvalidReason = null;
  let prepHiddenBeforeFinalReady = 0;
  let finalDomSlots = 0;
  let ownershipTransferred = false;

  for (const t of frameTimes(maxMs)) {
    if (t >= settledMs) presentationOwner = "settled";
    if (t >= bridgeStartMs) {
      presentationOwner = "route_bridge";
      bridgeActive = true;
    }
    if (t >= routeCommitMs) pathname = "/shuffle";
    if (pathname === "/shuffle" && t >= routeCommitMs + finalDomReadyMs) {
      finalDomSlots = presentedPrepSlots;
    }
    if (finalDomSlots >= 3 && t >= routeCommitMs + finalDomReadyMs + 32) {
      ownershipTransferred = true;
      presentationOwner = "final_route";
    }

    const hostMounted = true;
    const visibleSlots = ownershipTransferred ? finalDomSlots : presentedPrepSlots;

    let visibility = "visible";
    let opacity = 1;
    let zIndex = 1;
    let rectW = 390;
    let rectH = 844;
    let loadingShellVisible = 0;

    if (bridgeActive && !ownershipTransferred) {
      // NEW: route-bridge-owner CSS keeps prep host presentable even without slide-active.
      visibility = "visible";
      opacity = 1;
      zIndex = 1;
    } else if (ownershipTransferred) {
      visibility = "hidden";
      opacity = 0;
      zIndex = -1;
    }

    const state = {
      hostMounted,
      visibility,
      opacity,
      zIndex,
      rectW,
      rectH,
      visibleSlots,
      loadingShellVisible,
    };

    if (bridgeActive && !ownershipTransferred && presentationOwner === "route_bridge") {
      const check = hostPresentable(state);
      if (!check.ok) {
        bridgeOwnerNotPresentable += 1;
        if (firstInvalidMono == null) {
          firstInvalidMono = t;
          firstInvalidReason = check.reason;
        }
      }
      if (visibility === "hidden" && finalDomSlots < 3) prepHiddenBeforeFinalReady += 1;
    }
  }

  return {
    bridgeOwnerNotPresentableFrameCount: bridgeOwnerNotPresentable,
    bridgeOwnerFirstInvalidMono: firstInvalidMono,
    bridgeOwnerFirstInvalidReason: firstInvalidReason,
    prepHiddenBeforeFinalReady,
  };
}

export function enumerateRouteBridgeOwnerPermutations() {
  const out = [];
  for (const routeCommitMs of ROUTE_BRIDGE_ROUTE_DELAYS_MS) {
    for (const finalDomReadyMs of ROUTE_BRIDGE_FINAL_DOM_DELAYS_MS) {
      out.push({ routeCommitMs, finalDomReadyMs });
    }
  }
  while (out.length < 10_000) {
    const routeCommitMs = (out.length * 113) % 4501;
    const finalDomReadyMs = (out.length * 37) % 501;
    out.push({ routeCommitMs, finalDomReadyMs });
  }
  return out.slice(0, 10_000);
}

export function runRouteBridgeOwnerVisibilityHarness(permutations = enumerateRouteBridgeOwnerPermutations()) {
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const perm of permutations) {
    const result = simulateNewSettleToBridge(perm);
    const ok =
      result.bridgeOwnerNotPresentableFrameCount === 0 &&
      result.prepHiddenBeforeFinalReady === 0;
    if (ok) pass += 1;
    else {
      fail += 1;
      if (failures.length < 8) failures.push({ perm, result });
    }
  }

  return { pass, fail, total: permutations.length, failures };
}

export function compareOldVsNewHop2Table() {
  const oldResult = simulateOldSettleToBridge({
    routeCommitMs: HOP2_ROUTE_DELAY_MS,
    finalDomReadyMs: 100,
  });
  const newResult = simulateNewSettleToBridge({
    routeCommitMs: HOP2_ROUTE_DELAY_MS,
    finalDomReadyMs: 100,
  });

  return {
    atBridgeStartMs: HOP2_BRIDGE_START_MS,
    fields: [
      {
        field: "SETTLED owner host visibility",
        OLD: "visible (slide-active)",
        NEW: "visible (slide-active)",
      },
      {
        field: "BRIDGE_STARTED owner host visibility",
        OLD: "hidden (frozen)",
        NEW: "visible (route-bridge-owner)",
      },
      {
        field: "bridge owner opacity",
        OLD: "0",
        NEW: "1",
      },
      {
        field: "bridge owner z-index",
        OLD: "-1",
        NEW: "1",
      },
      {
        field: "visible Shuffle slots +630ms equivalent",
        OLD: "0 (owner hidden)",
        NEW: ">=3",
      },
      {
        field: "route delay",
        OLD: String(HOP2_ROUTE_DELAY_MS),
        NEW: String(HOP2_ROUTE_DELAY_MS),
      },
      {
        field: "first invalid owner frame",
        OLD: String(oldResult.bridgeOwnerFirstInvalidMono ?? "none"),
        NEW: String(newResult.bridgeOwnerFirstInvalidMono ?? "none"),
      },
      {
        field: "bridgeOwnerNotPresentableFrameCount",
        OLD: String(oldResult.bridgeOwnerNotPresentableFrameCount),
        NEW: String(newResult.bridgeOwnerNotPresentableFrameCount),
      },
      {
        field: "prep hidden before final ready",
        OLD: String(oldResult.prepHiddenBeforeFinalReady),
        NEW: String(newResult.prepHiddenBeforeFinalReady),
      },
    ],
    oldHop1Latent: simulateOldSettleToBridge({ routeCommitMs: HOP1_ROUTE_DELAY_MS, finalDomReadyMs: 50 }),
    oldHop2: oldResult,
    newHop2: newResult,
  };
}
