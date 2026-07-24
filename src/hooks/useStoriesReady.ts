import { isMainTabToShuffleMicroSlideEnabled } from "@/lib/perf/instantaneityFlags";

const STORIES_HYDRATED_SESSION_KEY = "sayittome:stories:hydrated:v1";

type StoriesGateInput = {
  loading: boolean;
  groupCount: number;
};

let storiesHasHydratedOnce = false;
let lastKnownGroupCount = 0;

function readPersistedStoriesHydrated() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(STORIES_HYDRATED_SESSION_KEY) === "1";
}

function persistStoriesHydrated() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORIES_HYDRATED_SESSION_KEY, "1");
}

if (readPersistedStoriesHydrated()) {
  storiesHasHydratedOnce = true;
}

export function hasStoriesEverHydrated() {
  return storiesHasHydratedOnce || readPersistedStoriesHydrated();
}

export function markStoriesHydrated(groupCount = lastKnownGroupCount) {
  if (groupCount > 0) {
    lastKnownGroupCount = Math.max(lastKnownGroupCount, groupCount);
  }
  storiesHasHydratedOnce = true;
  persistStoriesHydrated();
}

export function rememberStoriesGroupCount(count: number) {
  if (count > 0) {
    lastKnownGroupCount = Math.max(lastKnownGroupCount, count);
    storiesHasHydratedOnce = true;
    persistStoriesHydrated();
  }
}

/**
 * Full-page Stories loading copy ("Cargando historias...") is forbidden under the
 * main-tab no-loading contract (flag true). Cold index fetch must use a stable
 * empty/awaiting shell instead — prod latency otherwise keeps the copy visible
 * for the entire Shuffle→Stories 5s stay window (29e898d pre-input fail).
 */
export function shouldShowStoriesLoading(input: StoriesGateInput) {
  if (isMainTabToShuffleMicroSlideEnabled()) {
    return false;
  }

  if (hasStoriesEverHydrated()) {
    return false;
  }

  if (input.groupCount > 0) {
    rememberStoriesGroupCount(input.groupCount);
    return false;
  }

  return input.loading;
}
