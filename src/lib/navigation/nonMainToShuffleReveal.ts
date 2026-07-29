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
  // Android manual stuck: profile/edit/media sheets can leave content painted
  // over Shuffle even after pathname commits — clear all profile surface locks.
  body.classList.remove(
    "sayittome-chat-fullscreen-open",
    "sayittome-profile-edit-open",
    "sayittome-profile-media-sheet-open",
    "sayittome-profile-video-open",
  );
}

/** Hide the Next.js route shell (profile/settings) so it cannot paint over Shuffle. */
export function releaseNonMainRouteShellForShuffleReveal() {
  if (typeof document === "undefined") return;
  const shell = document.querySelector(".sayittome-route-shell");
  if (!shell) return;
  shell.setAttribute("hidden", "");
  shell.setAttribute("aria-hidden", "true");
  shell.setAttribute("data-sayittome-nonmain-released-for-shuffle", "1");
}

/** Restore route shell after leaving Shuffle so profile/settings can paint again. */
export function restoreNonMainRouteShellAfterShuffleReveal() {
  if (typeof document === "undefined") return;
  const shell = document.querySelector(
    '.sayittome-route-shell[data-sayittome-nonmain-released-for-shuffle="1"]',
  );
  if (!shell) return;
  shell.removeAttribute("hidden");
  shell.removeAttribute("aria-hidden");
  shell.removeAttribute("data-sayittome-nonmain-released-for-shuffle");
}

/** Eagerly present Shuffle host so profile DOM cannot remain the only painted surface. */
export function presentShuffleHostForNonMainReveal() {
  if (typeof document === "undefined") return;
  releaseNonMainRouteShellForShuffleReveal();
  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!host) return;
  host.classList.add(
    "sayittome-shuffle-keepalive-visible",
    "sayittome-shuffle-surface-active",
  );
  host.removeAttribute("inert");
  host.setAttribute("aria-hidden", "false");
  const style = host.style;
  if (style.opacity === "0") style.opacity = "1";
  if (style.visibility === "hidden") style.visibility = "visible";
  if (style.pointerEvents === "none") style.pointerEvents = "";
  // Own the paint plane above lingering profile route content.
  style.zIndex = "5";
  style.position = style.position || "fixed";
  if (!style.inset && !style.top) {
    style.inset = "0";
  }
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
  presentShuffleHostForNonMainReveal();

  return true;
}

export function clearShuffleRevealFromNonMainMarker() {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-sayittome-shuffle-reveal-from");
}
