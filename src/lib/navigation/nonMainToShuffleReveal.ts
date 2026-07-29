/**
 * Sync cleanup when navigating from profile / own-profile / settings / chat
 * threads into Shuffle — especially Android WebView where layout-effect
 * routeKind updates lag behind the kept-alive Shuffle surface.
 */
import { classifyAppRouteKind, isNonMainRoute } from "@/lib/navigation/routeKind";
import { forcePresentShuffleSurfaceForNonMainReveal } from "@/lib/navigation/shuffleHandoffState";
import { recordQaCriticalEvent } from "@/lib/qa/realDeviceQaDebug";

let recoveryTimer: number | null = null;
let recoveryUntil = 0;

function isHostPresentable(host: HTMLElement | null) {
  if (!host) return false;
  if (host.hasAttribute("hidden") || host.hasAttribute("inert")) return false;
  if (!host.classList.contains("sayittome-shuffle-keepalive-visible")) return false;
  if (host.classList.contains("sayittome-shuffle-keepalive-frozen")) return false;
  const rect = host.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return false;
  try {
    const style = window.getComputedStyle(host);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity || "1") < 0.05) return false;
  } catch {
    /* ignore */
  }
  return true;
}

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
  recordQaCriticalEvent("nav", "PROFILE_RELEASE", {
    pathname: window.location.pathname,
  });
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

function ensureShuffleHostMinimumShell(host: HTMLElement) {
  // If the host has no meaningful paint children, inject a local loading shell
  // so Android never ends on a pure black body background.
  const hasPaintChild = Boolean(
    host.querySelector(
      "[data-shuffle-list], .sayittome-shuffle-surface-prep, main, [data-nav-primary-content]",
    ),
  );
  if (hasPaintChild) return;
  if (host.querySelector("[data-sayittome-shuffle-min-shell='1']")) return;
  const shell = document.createElement("div");
  shell.setAttribute("data-sayittome-shuffle-min-shell", "1");
  shell.setAttribute("aria-hidden", "true");
  shell.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0b0b0b;color:#cfcfcf;font:600 14px/1.2 system-ui,sans-serif;z-index:1;pointer-events:none;";
  shell.textContent = "Shuffle";
  host.appendChild(shell);
}

function unfreezeShuffleHost(host: HTMLElement) {
  host.classList.remove("sayittome-shuffle-keepalive-frozen");
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
  style.background = style.background || "#0b0b0b";

  const prep = host.querySelector(
    ".sayittome-shuffle-surface-prep",
  ) as HTMLElement | null;
  if (prep) {
    if (prep.style.visibility === "hidden") prep.style.visibility = "visible";
    if (prep.style.opacity === "0") prep.style.opacity = "1";
    if (prep.style.pointerEvents === "none") prep.style.pointerEvents = "";
  }

  ensureShuffleHostMinimumShell(host);
}

function armDualHideRecovery() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  recoveryUntil = Date.now() + 4000;
  if (recoveryTimer) return;
  recoveryTimer = window.setInterval(() => {
    if (Date.now() > recoveryUntil) {
      if (recoveryTimer) window.clearInterval(recoveryTimer);
      recoveryTimer = null;
      return;
    }
    const path = window.location.pathname.split("?")[0].split("#")[0];
    const html = document.documentElement;
    const revealing =
      path === "/shuffle" ||
      html.hasAttribute("data-sayittome-shuffle-reveal-pending") ||
      html.hasAttribute("data-sayittome-shuffle-reveal-from") ||
      html.getAttribute("data-sayittome-route-kind") === "shuffle";
    if (!revealing) return;

    const host = document.getElementById(
      "sayittome-shuffle-keepalive-host",
    ) as HTMLElement | null;
    const shell = document.querySelector(
      ".sayittome-route-shell",
    ) as HTMLElement | null;
    const shellReleased =
      shell?.hasAttribute("data-sayittome-nonmain-released-for-shuffle") ||
      shell?.hasAttribute("hidden");

    if (!isHostPresentable(host)) {
      forcePresentShuffleSurfaceForNonMainReveal();
      if (host) unfreezeShuffleHost(host);
      // Never leave both surfaces hidden — restore profile shell until Shuffle paints.
      if (shellReleased && shell && !isHostPresentable(host)) {
        restoreNonMainRouteShellAfterShuffleReveal();
      }
      return;
    }

    // Host is presentable — safe to keep shell released.
    if (host && !shellReleased) {
      releaseNonMainRouteShellForShuffleReveal();
    }
  }, 50);
}

/**
 * Eagerly present Shuffle host so profile DOM cannot remain the only painted surface.
 * Returns false when the host is not in the DOM yet (React pin still mounting).
 */
export function presentShuffleHostForNonMainReveal(options?: {
  hideShell?: boolean;
}) {
  if (typeof document === "undefined") return false;
  const hideShell = options?.hideShell !== false;
  const host = document.getElementById(
    "sayittome-shuffle-keepalive-host",
  ) as HTMLElement | null;
  // Never release the profile/settings shell until Shuffle can own paint —
  // otherwise Android shows a sustained black frame (both surfaces hidden).
  if (!host) return false;

  forcePresentShuffleSurfaceForNonMainReveal();
  unfreezeShuffleHost(host);

  if (hideShell && isHostPresentable(host)) {
    releaseNonMainRouteShellForShuffleReveal();
  }
  armDualHideRecovery();
  return isHostPresentable(host);
}

function armRevealMarkers(fromKind: string) {
  const html = document.documentElement;
  html.setAttribute("data-sayittome-route-kind", "shuffle");
  html.setAttribute("data-sayittome-shuffle-reveal-from", fromKind);
  html.removeAttribute("data-sayittome-shuffle-reveal-pending");
  html.classList.remove("sayittome-shuffle-exit-handoff-pending");
  html.removeAttribute("data-shuffle-exit-handoff-target");
  html.classList.remove("sayittome-main-tab-handoff-pending");
  html.removeAttribute("data-sayittome-main-tab-handoff-source");
}

/**
 * Call on Shuffle pointerdown/click when the live URL is still non-main.
 * Live URL wins for routeKind once we commit to revealing Shuffle.
 *
 * Contract: never hide the profile shell until the Shuffle host exists and is
 * unfrozen + presentable. Loading shell inside Shuffle is OK; dual-hidden black is not.
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

  recordQaCriticalEvent("nav", "NAV_TAP_SHUFFLE", { from: live });
  recordQaCriticalEvent("nav", "ROUTE_START", {
    from: live,
    to: "/shuffle",
  });
  clearProfileViewerOverlayForShuffleNav();

  const fromKind = classifyAppRouteKind(live);
  const html = document.documentElement;
  // Markers BEFORE force-present notify so React mounts the host as visible
  // while URL is still /u/* (canShowShuffleKeepAliveSurface reads these).
  // Shell stays painted until host is presentable — see globals.css + recovery.
  html.setAttribute("data-sayittome-shuffle-reveal-pending", "1");
  html.setAttribute("data-sayittome-route-kind", "shuffle");
  forcePresentShuffleSurfaceForNonMainReveal();
  armDualHideRecovery();

  const hostReady = presentShuffleHostForNonMainReveal({ hideShell: false });
  if (hostReady) {
    armRevealMarkers(fromKind);
    // Only hide shell after presentable check inside present().
    presentShuffleHostForNonMainReveal({ hideShell: true });
    return true;
  }

  // Host not mounted yet — keep profile painted; retry after React pin flush.
  const retry = () => {
    if (presentShuffleHostForNonMainReveal({ hideShell: true })) {
      armRevealMarkers(fromKind);
      return;
    }
    // One more frame for slow Android WebView React commit.
    requestAnimationFrame(() => {
      if (presentShuffleHostForNonMainReveal({ hideShell: true })) {
        armRevealMarkers(fromKind);
      }
    });
  };
  requestAnimationFrame(() => requestAnimationFrame(retry));

  return true;
}

export function clearShuffleRevealFromNonMainMarker() {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-sayittome-shuffle-reveal-from");
  document.documentElement.removeAttribute("data-sayittome-shuffle-reveal-pending");
}
