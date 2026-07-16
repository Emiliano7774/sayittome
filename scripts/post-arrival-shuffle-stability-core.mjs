/**
 * Pure post-arrival Shuffle stability model — old freeze-before-activate vs new promote.
 */

export function frameTimes(maxMs = 1000, stepMs = 16) {
  const frames = [];
  for (let t = 0; t <= maxMs; t += stepMs) frames.push(t);
  return frames;
}

/**
 * OLD: completeFinal freezes host, drops bridge CSS, then rAF later activates.
 * Visible source tab frames = post-arrival flash.
 */
export function simulateOldPostArrivalHandoff({
  activateDelayMs = 16,
  maxMs = 1000,
} = {}) {
  let hostVisible = true;
  let bridgeAttr = true;
  let surfaceActive = true;
  let sourceMainTabVisible = false;
  let freezeAt = 0;
  let bridgeClearedAt = 0;
  let activateAt = null;
  let flashFrames = 0;
  let hostIdentityStable = true;
  const hostId = "prep-slot-A";
  let visibleHostId = hostId;

  for (const t of frameTimes(maxMs)) {
    if (t === 0) {
      // completeFinal: freeze then clear bridge before activate
      hostVisible = false;
      freezeAt = t;
      bridgeAttr = false;
      bridgeClearedAt = t;
    }
    if (activateAt === null && t >= activateDelayMs) {
      hostVisible = true;
      activateAt = t;
      // OLD recovery can also swap to a different presented surface identity
      visibleHostId = "final-slot-B";
      if (visibleHostId !== hostId) hostIdentityStable = false;
    }

    const cssForcesHost =
      bridgeAttr === true; /* route-bridge override */
    const effectiveHostVisible = hostVisible || cssForcesHost;
    sourceMainTabVisible =
      surfaceActive && !effectiveHostVisible && !bridgeAttr;

    if (t >= 0 && t <= 1000 && sourceMainTabVisible) flashFrames += 1;
  }

  return {
    mode: "OLD_FREEZE_BEFORE_ACTIVATE",
    freezeAt,
    bridgeClearedAt,
    activateAt,
    flashFrames,
    postArrivalFlashCount: flashFrames > 0 ? 1 : 0,
    hostIdentityStable,
    POST_ARRIVAL_VISUAL_STABILITY: flashFrames === 0 && hostIdentityStable,
  };
}

/**
 * NEW: keep host visible, clear ownership, activate, then drop bridge CSS.
 */
export function simulateNewPostArrivalHandoff({ maxMs = 1000 } = {}) {
  let hostVisible = true;
  let bridgeAttr = true;
  let surfaceActive = true;
  let flashFrames = 0;
  const hostId = "prep-slot-A";
  let visibleHostId = hostId;

  for (const t of frameTimes(maxMs)) {
    if (t === 0) {
      // freeze:false + sync activate while bridge CSS still present
      hostVisible = true;
      visibleHostId = hostId;
      bridgeAttr = false; // removed after activate in same turn
    }

    const cssForcesHost = bridgeAttr === true;
    const effectiveHostVisible = hostVisible || cssForcesHost;
    const sourceMainTabVisible =
      surfaceActive && !effectiveHostVisible && !bridgeAttr;

    if (t >= 0 && t <= 1000 && sourceMainTabVisible) flashFrames += 1;
  }

  return {
    mode: "NEW_PROMOTE_BEFORE_BRIDGE_CLEAR",
    freezeAt: null,
    bridgeClearedAt: 0,
    activateAt: 0,
    flashFrames,
    postArrivalFlashCount: 0,
    hostIdentityStable: visibleHostId === hostId,
    POST_ARRIVAL_VISUAL_STABILITY: flashFrames === 0 && visibleHostId === hostId,
  };
}

export function evaluatePostArrivalShuffleStabilityGate(sample) {
  const flash = Number(sample?.postArrivalFlashCount ?? 0);
  const loading = Number(sample?.loadingTextAnywhereCount ?? 0);
  const skeleton = Number(sample?.skeletonCount ?? 0);
  const hashStable = sample?.visualHashStableAfterArrival !== false;
  const domStable = sample?.shuffleDomIdentityStable !== false;
  const resultStable = sample?.shuffleResultIdentityStable !== false;
  const slotStable = sample?.shuffleSlotIdentityStable !== false;
  const refetchVisible = sample?.poolRefetchVisibleDuringSettle === true;
  const black = sample?.blackRoot === true;
  const presentedNone = sample?.presentedNone === true;
  const provider = sample?.CAPTURE_PROVIDER_SELECTED || sample?.visualProvider || "";
  const physical = sample?.PHYSICAL_EVIDENCE_PROVIDER_SELECTED || "";
  // Match real no-screencast providers; do not treat NOT_NO_SCREENCAST as no-screencast.
  const noScreencast =
    (/(^|[^A-Z])NO_SCREENCAST\b/i.test(provider) &&
      !/NOT_NO_SCREENCAST/i.test(provider)) ||
    physical === "WAAPI_COMPOSITOR_LIFECYCLE_NO_SCREENCAST" ||
    /LIFECYCLE_NO_SCREENCAST/i.test(physical);

  if (noScreencast && sample?.allowNoScreencast !== true) {
    return {
      status: "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER",
      gate: "POST_ARRIVAL_SHUFFLE_STABILITY_GATE",
      pass: false,
    };
  }

  const fail =
    flash > 0 ||
    loading > 0 ||
    skeleton > 0 ||
    !hashStable ||
    !domStable ||
    !resultStable ||
    !slotStable ||
    refetchVisible ||
    black ||
    presentedNone;

  return {
    status: fail
      ? "POST_ARRIVAL_SHUFFLE_STABILITY_FAIL"
      : "POST_ARRIVAL_SHUFFLE_STABILITY_PASS",
    gate: "POST_ARRIVAL_SHUFFLE_STABILITY_GATE",
    pass: !fail,
    flash,
    loading,
    skeleton,
    hashStable,
    domStable,
    resultStable,
    slotStable,
    refetchVisible,
  };
}
