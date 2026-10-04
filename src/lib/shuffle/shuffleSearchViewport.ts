export const SHUFFLE_SEARCH_OPEN_CLASS = "sayittome-shuffle-search-open";
export const SHUFFLE_LIST_EXTRA_VAR = "--sayittome-shuffle-list-extra";
export const SHUFFLE_OVERLAY_BAR_PX = 64;
export const SHUFFLE_LAST_ROW_PX = 96;
export const SHUFFLE_SEARCH_KEYBOARD_FLOOR_PX = 280;

export function readBrowserChromeBottomPx() {
  if (typeof window === "undefined") return 0;
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  const inset = window.innerHeight - viewport.height - viewport.offsetTop;
  return Math.max(0, Math.round(inset));
}

export function shuffleListExtraPx(input: {
  searchOpen: boolean;
  browserChromeBottom: number;
}) {
  const overlay = SHUFFLE_OVERLAY_BAR_PX + SHUFFLE_LAST_ROW_PX;
  if (!input.searchOpen) return overlay;
  const chrome = Math.max(0, Number(input.browserChromeBottom) || 0);
  return overlay + Math.max(0, SHUFFLE_SEARCH_KEYBOARD_FLOOR_PX - chrome);
}

export function isShuffleSearchOpen() {
  if (typeof document === "undefined") return false;
  return document.body.classList.contains(SHUFFLE_SEARCH_OPEN_CLASS);
}

export function syncShuffleListClearance() {
  if (typeof document === "undefined") return;
  const extra = shuffleListExtraPx({
    searchOpen: isShuffleSearchOpen(),
    browserChromeBottom: readBrowserChromeBottomPx(),
  });
  document.documentElement.style.setProperty(SHUFFLE_LIST_EXTRA_VAR, `${extra}px`);
}

export function setShuffleSearchOpen(open: boolean) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(SHUFFLE_SEARCH_OPEN_CLASS, open);
  syncShuffleListClearance();
}
