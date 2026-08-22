export const SHUFFLE_KEEPALIVE_HOST_ID = "sayittome-shuffle-keepalive-host";
const SHUFFLE_FEED_SCROLL_KEY = "sayittome:shuffle-feed-scroll:v1";
const SHUFFLE_RESTORE_MAX_ATTEMPTS = 8;

export function findShuffleKeepAliveScrollRoot(
  doc: Pick<Document, "getElementById"> | null | undefined = typeof document === "undefined"
    ? null
    : document,
) {
  if (!doc) return null;
  const host = doc.getElementById(SHUFFLE_KEEPALIVE_HOST_ID);
  if (!host) return null;
  return (
    host.querySelector<HTMLElement>("main[data-scroll-root]") ||
    host.querySelector<HTMLElement>("[data-scroll-root]")
  );
}

function shuffleScrollRoot() {
  return findShuffleKeepAliveScrollRoot();
}

export function captureShuffleFeedScroll(
  scrollTop?: number,
  options?: { allowZero?: boolean },
) {
  if (typeof window === "undefined") return 0;
  const root = shuffleScrollRoot();
  const next =
    typeof scrollTop === "number"
      ? Math.max(0, scrollTop)
      : Math.max(0, root?.scrollTop ?? 0);
  const previous = peekShuffleFeedScroll();
  if (!options?.allowZero && next <= 0 && previous > 0) {
    return previous;
  }
  try {
    sessionStorage.setItem(SHUFFLE_FEED_SCROLL_KEY, String(Math.round(next)));
  } catch {
    // Ignore quota / private-mode failures; in-memory restore still helps.
  }
  return next;
}

export function peekShuffleFeedScroll() {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(SHUFFLE_FEED_SCROLL_KEY);
    const value = Number(raw || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

let restoreRetryGeneration = 0;

export type RestoreShuffleFeedScrollOptions = {
  attempts?: number;
  schedule?: (cb: () => void) => void;
};

function defaultRestoreSchedule(cb: () => void) {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(cb);
    return;
  }
  setTimeout(cb, 0);
}

export function restoreShuffleFeedScroll(options?: RestoreShuffleFeedScrollOptions) {
  if (typeof window === "undefined") return 0;
  const next = peekShuffleFeedScroll();
  const token = ++restoreRetryGeneration;
  const maxAttempts = Math.max(
    1,
    Math.min(options?.attempts ?? SHUFFLE_RESTORE_MAX_ATTEMPTS, 12),
  );
  const schedule = options?.schedule ?? defaultRestoreSchedule;

  const apply = () => {
    const root = shuffleScrollRoot();
    if (!root) return false;
    root.scrollTop = next;
    return true;
  };

  if (apply()) return next;

  let attempt = 1;
  const tick = () => {
    if (token !== restoreRetryGeneration) return;
    if (apply() || attempt >= maxAttempts) return;
    attempt += 1;
    schedule(tick);
  };
  schedule(tick);
  return next;
}

let shuffleScrollHistoryInstalled = false;

export function installShuffleFeedScrollHistoryRestore() {
  if (typeof window === "undefined" || shuffleScrollHistoryInstalled) return;
  shuffleScrollHistoryInstalled = true;

  const restoreIfShuffle = () => {
    const path = String(window.location.pathname || "/").split("?")[0].split("#")[0];
    if (path === "/shuffle") restoreShuffleFeedScroll();
  };

  window.addEventListener("popstate", restoreIfShuffle);
  window.addEventListener("pageshow", restoreIfShuffle);
}

export function shouldSkipHardNavigateForWarmShuffle(input: {
  href: string;
  keepAliveActive: boolean;
}) {
  const path = String(input.href || "/").split("?")[0].split("#")[0] || "/";
  return input.keepAliveActive && path === "/shuffle";
}
