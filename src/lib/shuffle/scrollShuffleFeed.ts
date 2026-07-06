/** Scroll the active shuffle feed back to the top after a shuffle round. */
export function scrollShuffleFeedToTop() {
  if (typeof window === "undefined") return;

  const root =
    document.querySelector<HTMLElement>(
      "#sayittome-shuffle-keepalive-host main[data-scroll-root]",
    ) ||
    document.querySelector<HTMLElement>("[data-scroll-root].sayittome-shuffle-scroll") ||
    document.querySelector<HTMLElement>("[data-scroll-root].sayittome-shuffle-scroll-classic") ||
    document.querySelector<HTMLElement>("[data-scroll-root]");

  if (root) {
    root.scrollTo({ top: 0, behavior: "auto" });
    return;
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}
