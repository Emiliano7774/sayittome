import type { MainTabHref } from "@/lib/navigation/mainTabs";
import { isMainTabToShufflePresentationOwned } from "@/lib/navigation/mainTabToShuffleTransition";
import { canClearShuffleExitLatch } from "@/lib/navigation/tabHandoffDestinationGuard";
import { writeChatsPrepaintHandoffMarker } from "@/lib/chats/chatsPrepaintHandoff";
import { armChatsSequenceHandoffSuppress } from "@/lib/chats/chatsHandoffSuppress";
import { writeBoostPrepaintHandoffMarker } from "@/lib/boost/boostPrepaintHandoff";
import { armBoostSequenceHandoffSuppress } from "@/lib/boost/boostHandoffSuppress";

let shuffleRevealDeferred = false;
let deferSourcePath = "/chats";
let shuffleSurfacePresented = false;
let shuffleExitMainTabTarget: MainTabHref | null = null;
let handoffVersion = 0;
const listeners = new Set<() => void>();

/** Module watchdog arm hook — registered by ShuffleKeepAliveHost. */
let armExitNoLoadingWatchdog:
  | ((path: Exclude<MainTabHref, "/shuffle">, pathnameForCommit: string) => void)
  | null = null;

export function registerShuffleExitNoLoadingWatchdogArm(
  fn: (
    path: Exclude<MainTabHref, "/shuffle">,
    pathnameForCommit: string,
  ) => void,
) {
  armExitNoLoadingWatchdog = fn;
}

/**
 * Ensure the exit no-loading watchdog is running after beginShuffleExitToMainTab
 * from BottomNavLink (layout effect may miss if prevPath already advanced).
 */
export function ensureShuffleExitNoLoadingWatchdog(
  path: Exclude<MainTabHref, "/shuffle">,
  pathnameForCommit?: string,
) {
  armExitNoLoadingWatchdog?.(path, pathnameForCommit || path);
}

function notify() {
  handoffVersion += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeShuffleHandoffState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getShuffleHandoffVersion() {
  return handoffVersion;
}

export function isShuffleRevealDeferred() {
  return shuffleRevealDeferred;
}

export function getShuffleDeferSourcePath() {
  return deferSourcePath;
}

export function isShuffleSurfacePresented() {
  return shuffleSurfacePresented;
}

export function beginShuffleRevealDeferred(sourcePath: string) {
  deferSourcePath = sourcePath;
  shuffleRevealDeferred = true;
  shuffleSurfacePresented = false;
  notify();
}

export function presentShuffleSurface() {
  if (isMainTabToShufflePresentationOwned()) return;
  shuffleRevealDeferred = false;
  shuffleSurfacePresented = true;
  notify();
}

/**
 * Profile/settings → Shuffle: force the presented latch even if a main-tab
 * micro-slide still owns presentation. Without this, React keeps the keepalive
 * host frozen while CSS already hides the route shell → Android black frame.
 */
export function forcePresentShuffleSurfaceForNonMainReveal() {
  shuffleRevealDeferred = false;
  shuffleSurfacePresented = true;
  notify();
}

export function clearShuffleHandoffState() {
  if (isMainTabToShufflePresentationOwned()) return;
  if (!shuffleRevealDeferred && !shuffleSurfacePresented && !shuffleExitMainTabTarget) return;
  shuffleRevealDeferred = false;
  shuffleSurfacePresented = false;
  shuffleExitMainTabTarget = null;
  notify();
}

/**
 * Destination-scoped cleanup when a concrete main tab is already the route.
 * Clears entry defer/CSS leftovers even if presentation ownership still latches,
 * so a stale /chats source cannot paint under /stories|/boost|/settings.
 */
export function clearStaleShuffleEntryHandoffForMainTabDestination(
  destination: MainTabHref,
) {
  if (!destination || destination === "/shuffle") return false;
  shuffleRevealDeferred = false;
  if (typeof document !== "undefined") {
    const html = document.documentElement;
    // Force-clear even if presentation ownership still latches — destination
    // URL already won, so entry handoff CSS must not linger.
    html.classList.remove("sayittome-shuffle-handoff-pending");
    html.removeAttribute("data-shuffle-defer-source");
  }
  notify();
  return true;
}

/**
 * Abort/supersede cleanup: drop entry defer + pending CSS even when no concrete
 * destination URL has committed yet (mid-slide Stories/Chats tap).
 */
export function clearShuffleEntryHandoffAfterAbort() {
  if (!shuffleRevealDeferred) {
    if (typeof document !== "undefined") {
      const html = document.documentElement;
      if (
        !html.classList.contains("sayittome-shuffle-handoff-pending") &&
        !html.hasAttribute("data-shuffle-defer-source")
      ) {
        return false;
      }
    } else {
      return false;
    }
  }
  shuffleRevealDeferred = false;
  if (typeof document !== "undefined") {
    const html = document.documentElement;
    html.classList.remove("sayittome-shuffle-handoff-pending");
    html.removeAttribute("data-shuffle-defer-source");
  }
  notify();
  return true;
}

/** Retain shuffle as the presented source until a main-tab destination is ready. */
export function beginShuffleExitToMainTab(target: MainTabHref) {
  // Exit supersedes entry leftovers: stale defer/CSS must not re-paint the
  // previous source (often /chats) after Stories/Boost/Settings commit.
  shuffleRevealDeferred = false;
  shuffleExitMainTabTarget = target;
  if (typeof document !== "undefined") {
    const html = document.documentElement;
    html.classList.remove("sayittome-shuffle-handoff-pending");
    html.removeAttribute("data-shuffle-defer-source");
    html.classList.add("sayittome-shuffle-exit-handoff-pending");
    html.setAttribute("data-shuffle-exit-handoff-target", target);
  }
  // Ensure destination keep-alive can mount during exit (visibility is false while
  // the exit latch is up; mount still needs a visited mark for content readiness).
  void import("@/lib/navigation/mainTabKeepAlive").then((mod) => {
    mod.markMainTabVisited(target);
  });

  // Belt-and-suspenders: if pointerdown missed, still seed prepaint sync before remount.
  if (target === "/chats" && typeof window !== "undefined") {
    writeChatsPrepaintHandoffMarker({ from: "/shuffle" });
    armChatsSequenceHandoffSuppress(520, { from: "/shuffle" });
  }
  if (target === "/boost" && typeof window !== "undefined") {
    writeBoostPrepaintHandoffMarker({ from: "/shuffle" });
    armBoostSequenceHandoffSuppress(520, { from: "/shuffle" });
  }
  notify();
}

export type ClearShuffleExitOpts = {
  txId?: string | null;
  destination?: string | null;
  /** Bypass destination-guard token gate (tests / hard recovery only). */
  force?: boolean;
};

/**
 * Clear Shuffle→main exit latch. When a Boost/Chats destination guard token is
 * still in-flight (pre-releaseAllowed), unscoped clears are blocked so sequence
 * hops cannot disarm the active destination's CSS/eligibility window.
 */
export function clearShuffleExitToMainTab(opts?: ClearShuffleExitOpts) {
  const gate = canClearShuffleExitLatch(opts);
  if (!gate.allowed) return false;

  if (!shuffleExitMainTabTarget) {
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("sayittome-shuffle-exit-handoff-pending");
      document.documentElement.removeAttribute("data-shuffle-exit-handoff-target");
    }
    return true;
  }
  shuffleExitMainTabTarget = null;
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove("sayittome-shuffle-exit-handoff-pending");
    document.documentElement.removeAttribute("data-shuffle-exit-handoff-target");
  }
  notify();
  return true;
}

export function isShuffleExitToMainTabPending() {
  return shuffleExitMainTabTarget !== null;
}

export function getShuffleExitMainTabTarget() {
  return shuffleExitMainTabTarget;
}

export function isShuffleSourceRetainedForMainTabExit() {
  return shuffleExitMainTabTarget !== null && shuffleSurfacePresented;
}
