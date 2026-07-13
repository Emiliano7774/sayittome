import { hasShuffleEverHydrated } from "@/hooks/useShuffleReady";
import { isShuffleRevealDeferred } from "@/lib/navigation/shuffleHandoffState";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import { readCachedShufflePool } from "@/lib/shuffle/shuffleClientCache";
import {
  mayPresentShuffleLoading,
  traceShuffleLoadingRenderCommit,
} from "@/lib/shuffle/shuffleLoadingPresentationGate";
import { peekPinnedShuffleWindowCount } from "@/lib/shuffle/shufflePinnedWindow";
import { getVisibleShuffleProfiles } from "@/lib/shuffle/shuffleSlotsStore";
import { isShuffleHandoffPreparing } from "@/lib/shuffle/shuffleWarmVisual";
import {
  countDurableRestorableWarmSlots,
  hasDurableRestorableWarmShuffle,
  isShuffleDestinationWarmIntentActive,
  getShuffleDestinationWarmIntent,
} from "@/lib/shuffle/shuffleWarmHopIntent";

export type ShufflePresentationInput = {
  loading: boolean;
  listReady: boolean;
  visibleCount: number;
  poolProfileCount?: number;
};

export type ShufflePresentationState = {
  showShuffleLoading: boolean;
  showShuffleFeed: boolean;
  warm: boolean;
  trueCold: boolean;
  restorableSlots: number;
  effectiveVisibleCount: number;
  signature: string;
};

export type ShuffleRenderSignatureEntry = {
  monoMs: number;
  pathname: string;
  signature: string;
  poolLoading: boolean;
  poolListReady: boolean;
  poolProfileCount: number;
  visibleStoreCount: number;
  pinnedCount: number;
  cacheCount: number;
  hasShuffleEverHydrated: boolean;
  isShuffleRevealDeferred: boolean;
  isShuffleHandoffPreparing: boolean;
  warmHopIntent: ReturnType<typeof getShuffleDestinationWarmIntent>;
  warm: boolean;
  trueCold: boolean;
  showShuffleLoading: boolean;
  showShuffleFeed: boolean;
  restorableSlots: number;
};

const SIGNATURE_RING_MAX = 48;
const renderSignatureRing: ShuffleRenderSignatureEntry[] = [];
let lastRenderSignature = "";

function monoMs() {
  return Math.round(performance.timeOrigin + performance.now());
}

function pathnameNow() {
  if (typeof window === "undefined") return "";
  return window.location.pathname;
}

/** Slots available from store, pinned window, or client cache. */
export function countRestorableWarmFeedSlots(): number {
  const visible = getVisibleShuffleProfiles().length;
  if (visible >= 3) return visible;

  const durable = countDurableRestorableWarmSlots();
  if (durable >= 3) return durable;

  return Math.max(visible, durable);
}

export function hasRestorableWarmFeedSnapshot(): boolean {
  return countRestorableWarmFeedSlots() >= 3 || hasShuffleEverHydrated();
}

/**
 * Positive cold-entry definition: only this state may paint `[data-loading-shell]`.
 * Absence of currently rendered slots does NOT imply cold when durable restore exists.
 */
export function isTrueColdShuffleEntry(input: ShufflePresentationInput): boolean {
  if (isShuffleDestinationWarmIntentActive()) return false;
  if (hasDurableRestorableWarmShuffle()) return false;
  if (hasRestorableWarmFeedSnapshot()) return false;
  if (countRestorableWarmFeedSlots() >= 3) return false;
  if (hasShuffleEverHydrated()) return false;
  if (isShuffleRevealDeferred()) return false;
  if (isShuffleHandoffPreparing()) return false;
  if (input.visibleCount > 0 || input.listReady) return false;
  return true;
}

export function isWarmShufflePresentationContext(input: ShufflePresentationInput): boolean {
  return !isTrueColdShuffleEntry(input);
}

export function deriveShufflePresentation(input: ShufflePresentationInput): ShufflePresentationState {
  const restorableSlots = countRestorableWarmFeedSlots();
  const trueCold = isTrueColdShuffleEntry(input);
  const warm = !trueCold;
  const effectiveVisibleCount = warm ? Math.max(input.visibleCount, restorableSlots) : input.visibleCount;

  const requestedShowShuffleLoading =
    trueCold && input.loading && !input.listReady && input.visibleCount === 0;
  const showShuffleLoading = mayPresentShuffleLoading(input, requestedShowShuffleLoading);
  traceShuffleLoadingRenderCommit(showShuffleLoading, input, "deriveShufflePresentation");
  const showShuffleFeed =
    warm ||
    input.visibleCount > 0 ||
    input.listReady ||
    hasShuffleEverHydrated() ||
    restorableSlots >= 3;

  const signature = [
    trueCold ? "COLD" : "WARM",
    showShuffleLoading ? "LOADING" : "NO_LOADING",
    showShuffleFeed ? "FEED" : "NO_FEED",
    `vis=${input.visibleCount}`,
    `rest=${restorableSlots}`,
    `dur=${countDurableRestorableWarmSlots()}`,
    `intent=${isShuffleDestinationWarmIntentActive() ? 1 : 0}`,
    `ld=${input.loading ? 1 : 0}`,
    `lr=${input.listReady ? 1 : 0}`,
    `def=${isShuffleRevealDeferred() ? 1 : 0}`,
    `prep=${isShuffleHandoffPreparing() ? 1 : 0}`,
    `hyd=${hasShuffleEverHydrated() ? 1 : 0}`,
  ].join("|");

  if (typeof window !== "undefined" && signature !== lastRenderSignature) {
    lastRenderSignature = signature;
    const cached = readCachedShufflePool();
    const entry: ShuffleRenderSignatureEntry = {
      monoMs: monoMs(),
      pathname: pathnameNow(),
      signature,
      poolLoading: input.loading,
      poolListReady: input.listReady,
      poolProfileCount: input.poolProfileCount ?? 0,
      visibleStoreCount: input.visibleCount,
      pinnedCount: peekPinnedShuffleWindowCount(),
      cacheCount: cached?.length ?? 0,
      hasShuffleEverHydrated: hasShuffleEverHydrated(),
      isShuffleRevealDeferred: isShuffleRevealDeferred(),
      isShuffleHandoffPreparing: isShuffleHandoffPreparing(),
      warmHopIntent: getShuffleDestinationWarmIntent(),
      warm,
      trueCold,
      showShuffleLoading,
      showShuffleFeed,
      restorableSlots,
    };
    renderSignatureRing.push(entry);
    if (renderSignatureRing.length > SIGNATURE_RING_MAX) renderSignatureRing.shift();

    if (isNavTraceEnabled()) {
      console.info("[shuffle-render-signature]", entry);
    }
  }

  return {
    showShuffleLoading,
    showShuffleFeed,
    warm,
    trueCold,
    restorableSlots,
    effectiveVisibleCount,
    signature,
  };
}

export function exportShuffleRenderSignatureRing() {
  return [...renderSignatureRing];
}

export function resetShuffleRenderSignatureRing() {
  renderSignatureRing.length = 0;
  lastRenderSignature = "";
}

if (typeof window !== "undefined" && isNavTraceEnabled()) {
  window.__sayittomeShuffleRenderSignatures = {
    export: exportShuffleRenderSignatureRing,
    reset: resetShuffleRenderSignatureRing,
  };
}

declare global {
  interface Window {
    __sayittomeShuffleRenderSignatures?: {
      export: typeof exportShuffleRenderSignatureRing;
      reset: typeof resetShuffleRenderSignatureRing;
    };
  }
}
