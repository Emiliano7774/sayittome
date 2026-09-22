import type { MainTabHref } from "@/lib/navigation/mainTabs";
import { MAIN_TAB_HREFS } from "@/lib/navigation/mainTabs";

const RECONCILE_MS = 450;
let token = 0;
let scheduledFor = "";

function normalize(path: string) {
  const clean = String(path || "/").split("?")[0].split("#")[0];
  return clean.length > 1 && clean.endsWith("/") ? clean.slice(0, -1) : clean || "/";
}

function isBarPath(path: string) {
  return (MAIN_TAB_HREFS as readonly string[]).includes(path);
}

function clearStuckPaintLocks() {
  const html = document.documentElement;
  html.removeAttribute("data-main-tab-shuffle-slide");
  html.removeAttribute("data-main-tab-shuffle-source");
  html.removeAttribute("data-post-settle-route-bridge");
  html.classList.remove("sayittome-shuffle-handoff-pending");
  html.classList.remove("sayittome-main-tab-handoff-pending");
}

/**
 * Bottom-bar history can commit (the icon changes) while a keep-alive latch
 * keeps the previous screen painted. If that disagreement is still true after
 * a short beat, force the live URL to own the screen.
 */
export function scheduleStuckTabSurfaceReconcile(expectedPath: string) {
  if (typeof window === "undefined") return;
  const path = normalize(expectedPath);
  if (!isBarPath(path)) return;
  if (scheduledFor === path) return;
  scheduledFor = path;
  token += 1;
  const mine = token;
  window.setTimeout(() => {
    if (mine !== token) return;
    scheduledFor = "";
    const live = normalize(window.location.pathname);
    if (live !== path) return;
    void reconcileStuckTabSurface(live);
  }, RECONCILE_MS);
}

async function reconcileStuckTabSurface(path: string) {
  const html = document.documentElement;
  const slide = html.getAttribute("data-main-tab-shuffle-slide");
  const slideStuck = slide === "preparing" || slide === "armed" || slide === "running";
  const bridge = html.hasAttribute("data-post-settle-route-bridge");
  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  const shufflePainted = Boolean(
    shuffleHost?.classList.contains("sayittome-shuffle-keepalive-visible") &&
      !shuffleHost.classList.contains("sayittome-shuffle-keepalive-frozen"),
  );
  const shuffleOwnsBody = document.body.classList.contains("sayittome-shuffle-surface-active");
  const exitStuck = html.classList.contains("sayittome-shuffle-exit-handoff-pending");

  if (path === "/shuffle") {
    const mainOnTop = document.querySelector(".sayittome-main-tab-keepalive-visible");
    if (!mainOnTop || shufflePainted) return;
    const slideMod = await import("@/lib/navigation/mainTabToShuffleTransition");
    if (slideMod.isInternalMainTabToShuffleTransitionActive()) {
      slideMod.abortMainTabToShuffleTransition("stuck-surface-reconcile");
    }
    clearStuckPaintLocks();
    const shuffle = await import("@/lib/navigation/shuffleKeepAlive");
    shuffle.activateShuffleTabSurface();
    return;
  }

  if (!(MAIN_TAB_HREFS as readonly string[]).includes(path) || path === "/shuffle") return;
  const destId = `sayittome-main-tab-keepalive-${path.slice(1)}`;
  const dest = document.getElementById(destId);
  const destVisible = Boolean(dest?.classList.contains("sayittome-main-tab-keepalive-visible"));
  const otherMain = [...document.querySelectorAll(".sayittome-main-tab-keepalive-visible")].some(
    (el) => el.id !== destId,
  );
  const shuffleCovering = (shuffleOwnsBody && shufflePainted) || slideStuck || bridge;
  if (destVisible && !otherMain && !shuffleCovering && !exitStuck) return;

  clearStuckPaintLocks();
  const handoff = await import("@/lib/navigation/atomicMainTabHandoff");
  handoff.forcePresentMainTabAfterStableExit(path as MainTabHref);
  const shuffle = await import("@/lib/navigation/shuffleKeepAlive");
  shuffle.releaseShuffleTabSurface();
  const state = await import("@/lib/navigation/shuffleHandoffState");
  state.clearShuffleExitToMainTab({ destination: path, force: true });
}
