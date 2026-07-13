/**
 * Tooling parity for src/lib/navigation/mainTabShuffleCommitNavigation.ts.
 *
 * Pure decision of the navigation mode the main-tab -> Shuffle micro-slide COMMIT will use.
 * Keep in lockstep with computeMainTabToShuffleCommitNavigationMode() in the app module.
 */

const COMMIT_ACTIVE_PHASES = new Set([
  "preparing",
  "armed",
  "sliding",
  "settled",
  "route_bridge",
]);

/**
 * Runtime force decision — mirrors isMicroSlideCommitActiveForShuffle().
 */
export function computeForceSoftNavigationForCommit({
  href = "/shuffle",
  microSlideEnabled = false,
  phase = null,
  destination = "shuffle",
  stale = false,
} = {}) {
  const normalized = String(href || "/").split("?")[0].split("#")[0] || "/";
  if (microSlideEnabled !== true) return false;
  if (normalized !== "/shuffle") return false;
  if (stale === true) return false;
  if (!phase || !COMMIT_ACTIVE_PHASES.has(phase)) return false;
  if (destination !== "shuffle") return false;
  return true;
}

/**
 * Same as computeForceSoftNavigationForCommit — active micro-slide owns commit
 * (history or soft depending on mode selection).
 */
export function computeForceSameDocumentCommitForMicroSlide(input = {}) {
  return computeForceSoftNavigationForCommit(input);
}

/**
 * @param {{
 *   href?: string,
 *   microSlideEnabled?: boolean,
 *   softOverrideCapable?: boolean,
 *   historyOverrideCapable?: boolean,
 *   nativeShellHardNavWouldApply?: boolean,
 *   contextKnown?: boolean,
 * }} input
 */
export function computeCommitNavigationMode({
  href = "/shuffle",
  microSlideEnabled = false,
  softOverrideCapable = true,
  historyOverrideCapable = true,
  nativeShellHardNavWouldApply = false,
  contextKnown = true,
} = {}) {
  const normalized = String(href || "/").split("?")[0].split("#")[0] || "/";
  const historyCapable = historyOverrideCapable !== false;
  const softCapable = softOverrideCapable === true;

  const microSlideHistoryOverrideApplies =
    historyCapable === true &&
    microSlideEnabled === true &&
    normalized === "/shuffle" &&
    nativeShellHardNavWouldApply === true;

  const microSlideSoftOverrideApplies =
    softCapable === true &&
    microSlideEnabled === true &&
    normalized === "/shuffle" &&
    !microSlideHistoryOverrideApplies;

  const microSlideCommitOverrideApplies =
    microSlideHistoryOverrideApplies || microSlideSoftOverrideApplies;

  let effectiveCommitNavigationMode;
  let reason;
  let allowedCommitModeForMicroSlide = null;

  if (contextKnown !== true) {
    effectiveCommitNavigationMode = "unknown";
    reason = "context-unknown";
  } else if (microSlideHistoryOverrideApplies) {
    effectiveCommitNavigationMode = "history";
    reason = "micro-slide-history-override-native-shell";
    allowedCommitModeForMicroSlide = "history";
  } else if (microSlideSoftOverrideApplies) {
    effectiveCommitNavigationMode = "soft";
    reason = nativeShellHardNavWouldApply
      ? "micro-slide-soft-override-native-shell-fallback"
      : "micro-slide-soft-override";
    allowedCommitModeForMicroSlide = "soft";
  } else if (nativeShellHardNavWouldApply === true) {
    effectiveCommitNavigationMode = "hard";
    reason = "native-shell-hard-nav";
  } else {
    effectiveCommitNavigationMode = "soft";
    reason = "default-router-push";
  }

  return {
    href: normalized,
    destination: normalized,
    nativeShellHardNavWouldNormallyApply: nativeShellHardNavWouldApply === true,
    microSlideEnabled: microSlideEnabled === true,
    microSlideSoftOverrideApplies,
    microSlideHistoryOverrideApplies,
    microSlideCommitOverrideApplies,
    softNavigationToShuffleAvailable: effectiveCommitNavigationMode === "soft",
    historyNavigationToShuffleAvailable: effectiveCommitNavigationMode === "history",
    allowedCommitModeForMicroSlide,
    effectiveCommitNavigationMode,
    reason,
  };
}
