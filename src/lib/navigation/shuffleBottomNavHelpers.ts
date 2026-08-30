/** True only on live /shuffle — bottom nav reshuffles; any other URL must navigate first. */
export function isShuffleBottomNavReshuffleTarget() {
  if (typeof window === "undefined") return false;
  const live = String(window.location.pathname || "/").split("?")[0].split("#")[0];
  return live === "/shuffle";
}

/**
 * Mirrors BottomNav.openShuffleTab reshuffle-vs-navigate branch (entrypoint contract).
 * Returns "reshuffle" | "navigate" | "blocked".
 */
export function resolveShuffleBottomNavTapAction(options?: {
  blockDuringSlide?: boolean;
}) {
  if (options?.blockDuringSlide) return "blocked";
  if (isShuffleBottomNavReshuffleTarget()) return "reshuffle";
  return "navigate";
}
