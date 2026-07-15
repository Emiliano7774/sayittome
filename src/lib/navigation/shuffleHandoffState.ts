import type { MainTabHref } from "@/lib/navigation/mainTabs";
import { isMainTabToShufflePresentationOwned } from "@/lib/navigation/mainTabToShuffleTransition";
import { canClearShuffleExitLatch } from "@/lib/navigation/tabHandoffDestinationGuard";

let shuffleRevealDeferred = false;
let deferSourcePath = "/chats";
let shuffleSurfacePresented = false;
let shuffleExitMainTabTarget: MainTabHref | null = null;
let handoffVersion = 0;
const listeners = new Set<() => void>();

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

export function clearShuffleHandoffState() {
  if (isMainTabToShufflePresentationOwned()) return;
  if (!shuffleRevealDeferred && !shuffleSurfacePresented && !shuffleExitMainTabTarget) return;
  shuffleRevealDeferred = false;
  shuffleSurfacePresented = false;
  shuffleExitMainTabTarget = null;
  notify();
}

/** Retain shuffle as the presented source until a main-tab destination is ready. */
export function beginShuffleExitToMainTab(target: MainTabHref) {
  shuffleExitMainTabTarget = target;
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("sayittome-shuffle-exit-handoff-pending");
    document.documentElement.setAttribute(
      "data-shuffle-exit-handoff-target",
      target,
    );
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
