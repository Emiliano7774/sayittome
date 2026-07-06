import type { MainTabHref } from "@/lib/navigation/mainTabs";

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
  shuffleRevealDeferred = false;
  shuffleSurfacePresented = true;
  notify();
}

export function clearShuffleHandoffState() {
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
  }
  notify();
}

export function clearShuffleExitToMainTab() {
  if (!shuffleExitMainTabTarget) return;
  shuffleExitMainTabTarget = null;
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove("sayittome-shuffle-exit-handoff-pending");
  }
  notify();
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
