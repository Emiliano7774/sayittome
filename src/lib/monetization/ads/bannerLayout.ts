/** Distance from screen bottom to top of bottom nav — for future banner margin. */
export function measureBottomNavClearancePx() {
  if (typeof window === "undefined") return 0;

  if (document.body.classList.contains("sayittome-story-viewer-open")) {
    return 0;
  }

  const nav = document.querySelector(".sayittome-bottom-nav");
  if (!nav) return 0;

  const style = window.getComputedStyle(nav);
  if (style.display === "none" || style.visibility === "hidden") return 0;

  return Math.max(0, Math.round(nav.getBoundingClientRect().height));
}
