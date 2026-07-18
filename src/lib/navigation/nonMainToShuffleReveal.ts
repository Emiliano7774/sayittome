/**
 * Sync cleanup when navigating from profile / own-profile / settings / chat
 * threads into Shuffle — especially Android WebView where layout-effect
 * routeKind updates lag behind the kept-alive Shuffle surface.
 */
import { classifyAppRouteKind, isNonMainRoute } from "@/lib/navigation/routeKind";

export function clearProfileViewerOverlayForShuffleNav() {
  if (typeof document === "undefined") return;
  const body = document.body;
  if (body.classList.contains("sayittome-profile-viewer-open")) {
    body.classList.remove("sayittome-profile-viewer-open");
    try {
      window.dispatchEvent(new Event("sayittome:close-profile-viewer"));
    } catch {
      /* ignore */
    }
  }
  body.classList.remove("sayittome-chat-fullscreen-open");
}

/**
 * Call on Shuffle pointerdown/click when the live URL is still non-main.
 * Live URL wins for routeKind once we commit to revealing Shuffle.
 */
export function prepareShuffleRevealFromNonMainRoute(fromPath?: string) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const live =
    fromPath ||
    window.location.pathname.split("?")[0].split("#")[0] ||
    "/";

  if (!isNonMainRoute(live)) return false;

  clearProfileViewerOverlayForShuffleNav();

  const html = document.documentElement;
  // Drop sticky non-main kind before router commit so Shuffle CSS can paint.
  html.setAttribute("data-sayittome-route-kind", "shuffle");
  html.setAttribute("data-sayittome-shuffle-reveal-from", classifyAppRouteKind(live));
  html.classList.remove("sayittome-shuffle-exit-handoff-pending");
  html.removeAttribute("data-shuffle-exit-handoff-target");
  html.classList.remove("sayittome-main-tab-handoff-pending");
  html.removeAttribute("data-sayittome-main-tab-handoff-source");

  return true;
}

export function clearShuffleRevealFromNonMainMarker() {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-sayittome-shuffle-reveal-from");
}
