type ShuffleGateInput = {
  loading: boolean;
  listReady: boolean;
  visibleCount: number;
};

let shuffleHasHydratedOnce = false;
let lastKnownVisibleCount = 0;

export function markShuffleHydrated(visibleCount = lastKnownVisibleCount) {
  if (visibleCount > 0) {
    lastKnownVisibleCount = Math.max(lastKnownVisibleCount, visibleCount);
  }
  shuffleHasHydratedOnce = true;
}

export function rememberShuffleVisibleCount(count: number) {
  if (count > 0) {
    lastKnownVisibleCount = Math.max(lastKnownVisibleCount, count);
    shuffleHasHydratedOnce = true;
  }
}

/** Full-page shuffle loader only on the very first cold open with no cached rows. */
export function shouldShowShuffleLoading(input: ShuffleGateInput) {
  const visibleCount = input.visibleCount;

  if (visibleCount > 0 || input.listReady) {
    rememberShuffleVisibleCount(visibleCount);
    return false;
  }

  if (shuffleHasHydratedOnce || lastKnownVisibleCount > 0) {
    return false;
  }

  return input.loading;
}
