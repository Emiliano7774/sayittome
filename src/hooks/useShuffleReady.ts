const SHUFFLE_HYDRATED_SESSION_KEY = "sayittome:shuffle:hydrated:v1";

type ShuffleGateInput = {
  loading: boolean;
  listReady: boolean;
  visibleCount: number;
};

let shuffleHasHydratedOnce = false;
let lastKnownVisibleCount = 0;

function readPersistedShuffleHydrated() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(SHUFFLE_HYDRATED_SESSION_KEY) === "1";
}

function persistShuffleHydrated() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SHUFFLE_HYDRATED_SESSION_KEY, "1");
}

if (readPersistedShuffleHydrated()) {
  shuffleHasHydratedOnce = true;
}

export function hasShuffleEverHydrated() {
  return shuffleHasHydratedOnce || readPersistedShuffleHydrated();
}

export function markShuffleHydrated(visibleCount = lastKnownVisibleCount) {
  if (visibleCount > 0) {
    lastKnownVisibleCount = Math.max(lastKnownVisibleCount, visibleCount);
  }
  shuffleHasHydratedOnce = true;
  persistShuffleHydrated();
}

export function rememberShuffleVisibleCount(count: number) {
  if (count > 0) {
    lastKnownVisibleCount = Math.max(lastKnownVisibleCount, count);
    shuffleHasHydratedOnce = true;
    persistShuffleHydrated();
  }
}

/** Full-page shuffle loader only on the very first cold open with no cached rows. */
export function shouldShowShuffleLoading(input: ShuffleGateInput) {
  if (hasShuffleEverHydrated()) {
    return false;
  }

  const visibleCount = input.visibleCount;

  if (visibleCount > 0 || input.listReady) {
    rememberShuffleVisibleCount(visibleCount);
    return false;
  }

  return input.loading;
}
