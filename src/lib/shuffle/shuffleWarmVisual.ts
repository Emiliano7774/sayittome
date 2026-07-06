import { hasShuffleEverHydrated } from "@/hooks/useShuffleReady";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import { getVisibleShuffleProfiles } from "@/lib/shuffle/shuffleSlotsStore";
import { hasShuffleWarmVisualReady, restorePinnedShuffleWindowSync } from "@/lib/shuffle/shufflePinnedWindow";

let warmReturnVersion = 0;
const listeners = new Set<() => void>();

function notify() {
  warmReturnVersion += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeShuffleWarmReturn(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getShuffleWarmReturnVersion() {
  return warmReturnVersion;
}

/** Synchronous PREPARE before router commits to /shuffle. */
export function prepareShuffleWarmTabReturn() {
  const ready = restorePinnedShuffleWindowSync();
  notify();
  return ready;
}

export function isShuffleWarmVisualReady() {
  return hasShuffleWarmVisualReady();
}

export type ShuffleLoadingGateInput = {
  loading: boolean;
  listReady: boolean;
  visibleCount: number;
};

/** Cold-only full-page loader. Warm keep-alive must never paint this shell. */
export function shouldPaintShuffleLoadingShell(input: ShuffleLoadingGateInput) {
  if (hasShuffleEverHydrated()) return false;
  if (input.visibleCount > 0) return false;
  if (input.listReady) return false;
  if (hasShuffleWarmVisualReady()) return false;

  return input.loading;
}

export type ShuffleVisualCommitTrace = {
  at: number;
  phase: string;
  loadingShell: boolean;
  visibleCount: number;
  listReady: boolean;
  warmReady: boolean;
  textSample: string;
};

const visualCommits: ShuffleVisualCommitTrace[] = [];

export function traceShuffleVisualCommit(
  phase: string,
  input: {
    showLoadingShell: boolean;
    visibleCount: number;
    listReady: boolean;
  },
) {
  if (!isNavTraceEnabled() || typeof document === "undefined") return;

  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  const text = host?.textContent?.slice(0, 120) ?? "";

  visualCommits.push({
    at: Math.round(performance.now()),
    phase,
    loadingShell: input.showLoadingShell,
    visibleCount: input.visibleCount,
    listReady: input.listReady,
    warmReady: hasShuffleWarmVisualReady(),
    textSample: text,
  });

  if (visualCommits.length > 40) {
    visualCommits.splice(0, visualCommits.length - 40);
  }
}

export function exportShuffleVisualCommits() {
  return [...visualCommits];
}

export function resetShuffleVisualCommits() {
  visualCommits.length = 0;
}

if (typeof window !== "undefined" && isNavTraceEnabled()) {
  window.__sayittomeShuffleVisualCommits = {
    export: exportShuffleVisualCommits,
    reset: resetShuffleVisualCommits,
  };
}

declare global {
  interface Window {
    __sayittomeShuffleVisualCommits?: {
      export: typeof exportShuffleVisualCommits;
      reset: typeof resetShuffleVisualCommits;
    };
  }
}
