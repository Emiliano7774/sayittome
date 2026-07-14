/**
 * BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE
 * No-screencast providers cannot pass / make rollout eligible.
 */

export const BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE =
  "BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE";

export function isNoScreencastProvider(provider) {
  const p = String(provider || "");
  if (!p) return false;
  // Explicit robust visual providers that mention NOT_NO_SCREENCAST must pass.
  if (/NOT_NO_SCREENCAST/i.test(p)) return false;
  if (/PLAYWRIGHT_DOM_SAMPLE/i.test(p)) return false;
  if (/CDP_SCREENCAST/i.test(p) && !/NO_SCREENCAST/i.test(p.replace(/NOT_NO_SCREENCAST/gi, ""))) {
    return false;
  }
  return (
    /(^|[^A-Z])NO_SCREENCAST([^A-Z]|$)/i.test(p) ||
    /NATIVE_NO_SCREENCAST/i.test(p) ||
    /PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST/i.test(p)
  );
}

/**
 * @param {object} hop
 */
export function evaluateBidirectionalTabNoLoadingVisualGate(hop = {}) {
  const provider =
    hop.visualProvider ||
    hop.CAPTURE_PROVIDER_SELECTED ||
    hop.PHYSICAL_EVIDENCE_PROVIDER_SELECTED ||
    hop.provider ||
    null;

  if (isNoScreencastProvider(provider) || hop.noScreencastUsed === true) {
    return {
      gate: BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE,
      status: "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER",
      pass: false,
      rolloutEligible: false,
      provider,
      reason: "NO_SCREENCAST_CANNOT_PASS_BIDIRECTIONAL_NO_LOADING_GATE",
    };
  }

  if (hop.classification === "DIRECT_COLD_LOADING_ALLOWED" || hop.directCold === true) {
    return {
      gate: BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE,
      status: "DIRECT_COLD_LOADING_ALLOWED",
      pass: true,
      rolloutEligible: true,
      provider,
    };
  }

  if (
    hop.classification === "SKIPPED_SOURCE_UNAVAILABLE" ||
    hop.skippedSourceUnavailable === true
  ) {
    return {
      gate: BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE,
      status: "SKIPPED_SOURCE_UNAVAILABLE",
      pass: false,
      clean: false,
      rolloutEligible: false,
      provider,
      note: "Unavailable source does not count as clean",
    };
  }

  const loadingText =
    hop.visibleLoadingTextCount > 0 ||
    hop.anyLoadingText === true ||
    hop.loadingTextVisible === true;
  const loadingShell =
    hop.loadingShellCount > 0 ||
    hop.anyLoadingShell === true ||
    hop.loadingShellVisible === true;
  const blackRoot = hop.blackRootCount > 0 || hop.blackRoot === true;
  const presentedNone = hop.presentedNoneCount > 0 || hop.presentedNone === true;
  const routeMismatch = hop.routeMismatchCount > 0 || hop.routeMismatch === true;
  const archivedAsLive = hop.archivedInterpretedAsLiveCount > 0;
  const idleMissing = hop.postHopCanonicalIdle === false;

  if (loadingText || loadingShell) {
    return {
      gate: BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE,
      status: "NO_LOADING_MID_TRANSITION_FAIL",
      pass: false,
      rolloutEligible: false,
      loadingText,
      loadingShell,
      classification: hop.classification || null,
      provider,
    };
  }

  if (blackRoot || presentedNone || routeMismatch || archivedAsLive || idleMissing) {
    return {
      gate: BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE,
      status: "PRESENTATION_FAIL",
      pass: false,
      rolloutEligible: false,
      blackRoot,
      presentedNone,
      routeMismatch,
      archivedAsLive,
      idleMissing,
      provider,
    };
  }

  const clean =
    hop.classification === "CLEAN" ||
    hop.clean === true ||
    (!loadingText && !loadingShell && hop.reachedDest !== false);

  return {
    gate: BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE,
    status: clean ? "NO_LOADING_TRANSITION_PASS" : "NO_LOADING_TRANSITION_FAIL",
    pass: clean,
    rolloutEligible: clean,
    provider,
  };
}

/**
 * @param {object[]} hops
 */
export function evaluateBidirectionalSeries(hops = []) {
  const results = hops.map((h) => evaluateBidirectionalTabNoLoadingVisualGate(h));
  const skipped = results.filter((r) => r.status === "SKIPPED_SOURCE_UNAVAILABLE");
  const evaluated = results.filter((r) => r.status !== "SKIPPED_SOURCE_UNAVAILABLE");
  const failed = evaluated.filter((r) => !r.pass);
  const noScreencast = results.some(
    (r) => r.status === "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER",
  );
  return {
    gate: BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE,
    PERMANENT_ROLLOUT_BIDIRECTIONAL_NO_LOADING_GATE:
      !noScreencast && failed.length === 0 && evaluated.length > 0,
    pass: !noScreencast && failed.length === 0 && evaluated.length > 0,
    evaluatedCount: evaluated.length,
    cleanCount: evaluated.filter((r) => r.pass).length,
    skippedCount: skipped.length,
    noScreencastBlocked: noScreencast,
    results,
  };
}
