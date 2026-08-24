/**
 * Fail-closed Shuffle recover for profile back, repeated hops, and native
 * resume. Presents the existing keep-alive snapshot — never remounts the tree,
 * never reshuffles, and never treats an empty #0b0b0b host as success.
 */
import { restoreShuffleFeedScroll } from "@/lib/navigation/shuffleFeedScroll";
import {
  clearShuffleExitToMainTab,
  forcePresentShuffleSurfaceForNonMainReveal,
  isShuffleExitToMainTabPending,
  isShuffleRevealDeferred,
} from "@/lib/navigation/shuffleHandoffState";
import {
  canHideCurrentShellForShuffle,
  hasRealShuffleFeedContent,
} from "@/lib/navigation/shuffleSnapshotPresent";
import { restoreShuffleViewportSnapshot } from "@/lib/navigation/shuffleViewportSnapshot";
import { restorePinnedShuffleWindowSync } from "@/lib/shuffle/shufflePinnedWindow";

export const SHUFFLE_KEEPALIVE_HOST_ID = "sayittome-shuffle-keepalive-host";

export type ShuffleRecoverReason =
  | "profile-back"
  | "app-resume"
  | "visibility"
  | "pageshow"
  | "stale-reconcile"
  | "shuffle-profile-hop"
  | "chats-to-shuffle";

export type ShuffleRecoverResult = {
  reason: ShuffleRecoverReason | "not-shuffle";
  presented: boolean;
  snapshotPainted: boolean;
  remounted: boolean;
  emptiedBackground: boolean;
  hostFrozen: boolean;
};

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

function readLivePath() {
  if (typeof window === "undefined") return "/";
  return normalizePath(window.location.pathname);
}

export function shouldRecoverShuffleOnForeground(pathname = readLivePath()) {
  if (typeof document === "undefined") return false;
  const path = normalizePath(pathname);
  if (path === "/shuffle") return true;
  const html = document.documentElement;
  if (!html) return false;
  const classList = html.classList;
  const hasAttr =
    typeof html.hasAttribute === "function"
      ? (name: string) => html.hasAttribute(name)
      : () => false;
  const getAttr =
    typeof html.getAttribute === "function"
      ? (name: string) => html.getAttribute(name)
      : () => null;
  return (
    Boolean(classList?.contains?.("sayittome-shuffle-return-pending")) ||
    hasAttr("data-sayittome-shuffle-reveal-pending") ||
    hasAttr("data-sayittome-shuffle-reveal-from") ||
    getAttr("data-sayittome-route-kind") === "shuffle"
  );
}

export function shouldHideRouteShellForShuffleReturn(host: Element | null) {
  return canHideCurrentShellForShuffle(host);
}

export function hasShuffleSnapshotPaint(host: Element | null) {
  return hasRealShuffleFeedContent(host);
}

function isEmptyBlackHost(host: HTMLElement | null) {
  if (!host) return true;
  if (hasShuffleSnapshotPaint(host)) return false;
  const prep = host.querySelector(".sayittome-shuffle-surface-prep");
  if (prep && prep.childElementCount > 0) return false;
  return true;
}

function unfreezeExistingHost(host: HTMLElement) {
  host.classList.remove("sayittome-shuffle-keepalive-frozen");
  host.classList.add("sayittome-shuffle-keepalive-visible");
  host.removeAttribute("inert");
  host.setAttribute("aria-hidden", "false");
  const style = host.style;
  if (style.opacity === "0") style.opacity = "1";
  if (style.visibility === "hidden") style.visibility = "visible";
  if (style.pointerEvents === "none") style.pointerEvents = "";
  const prep = host.querySelector(
    ".sayittome-shuffle-surface-prep",
  ) as HTMLElement | null;
  if (prep) {
    if (prep.style.visibility === "hidden") prep.style.visibility = "visible";
    if (prep.style.opacity === "0") prep.style.opacity = "1";
    if (prep.style.pointerEvents === "none") prep.style.pointerEvents = "";
  }
}

function clearStaleShuffleLatches(path: string) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (path === "/shuffle" && isShuffleExitToMainTabPending()) {
    clearShuffleExitToMainTab({ destination: "/shuffle", force: true });
  }
  if (path === "/shuffle" && isShuffleRevealDeferred()) {
    forcePresentShuffleSurfaceForNonMainReveal();
  }
  if (path === "/shuffle") {
    html.classList.remove("sayittome-shuffle-handoff-pending");
    html.removeAttribute("data-shuffle-defer-source");
  }
}

export function presentExistingShuffleSnapshot(options: {
  reason: ShuffleRecoverReason;
}): ShuffleRecoverResult {
  const reason = options.reason;
  const empty: ShuffleRecoverResult = {
    reason,
    presented: false,
    snapshotPainted: false,
    remounted: false,
    emptiedBackground: false,
    hostFrozen: true,
  };

  if (typeof document === "undefined") return empty;

  const path = readLivePath();
  const host = document.getElementById(
    SHUFFLE_KEEPALIVE_HOST_ID,
  ) as HTMLElement | null;

  if (!host) {
    return empty;
  }

  // Reconstruct window + scroll BEFORE unfreeze so the first visible paint
  // is already at the captured profile/pixel (no top flash / reshuffle).
  restorePinnedShuffleWindowSync();
  restoreShuffleViewportSnapshot();
  restoreShuffleFeedScroll();

  const snapshotPainted = hasShuffleSnapshotPaint(host);
  if (!snapshotPainted && isEmptyBlackHost(host)) {
    return {
      ...empty,
      emptiedBackground: false,
      hostFrozen: host.classList.contains("sayittome-shuffle-keepalive-frozen"),
    };
  }

  clearStaleShuffleLatches(path);
  unfreezeExistingHost(host);
  forcePresentShuffleSurfaceForNonMainReveal();
  // Re-assert scroll after unfreeze (layout may clamp once).
  restoreShuffleViewportSnapshot();
  restoreShuffleFeedScroll();

  if (typeof document !== "undefined" && path === "/shuffle") {
    document.body.classList.add("sayittome-shuffle-route");
    document.body.classList.add("sayittome-shuffle-surface-active");
  }

  return {
    reason,
    presented: true,
    snapshotPainted: hasShuffleSnapshotPaint(host),
    remounted: false,
    emptiedBackground: false,
    hostFrozen: false,
  };
}

export function recoverShuffleOnForeground(
  reason: Exclude<ShuffleRecoverReason, "profile-back"> = "app-resume",
): ShuffleRecoverResult {
  if (!shouldRecoverShuffleOnForeground()) {
    return {
      reason: "not-shuffle",
      presented: false,
      snapshotPainted: false,
      remounted: false,
      emptiedBackground: false,
      hostFrozen: false,
    };
  }
  return presentExistingShuffleSnapshot({ reason });
}

/** Resume/back recover must keep the pinned snapshot; never drop handoff state. */
export const RESUME_RECOVER_DROPS_HANDOFF_SNAPSHOT = false;
