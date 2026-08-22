import { findShuffleKeepAliveScrollRoot } from "@/lib/navigation/shuffleFeedScroll";

/** Scroll the active shuffle feed back to the top after a shuffle round. */
export function scrollShuffleFeedToTop() {
  if (typeof window === "undefined") return;

  const root = findShuffleKeepAliveScrollRoot();

  if (root) {
    root.scrollTo({ top: 0, behavior: "auto" });
    return;
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}
