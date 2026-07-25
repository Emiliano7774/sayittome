/**
 * PROFILE_ROUTE_MAIN_TAB_LEAK isolation: when the live route is not a main tab,
 * neutralize sticky handoff / soft-commit presentation so Chats/Shuffle cannot
 * paint under /u/[username] (or other non-main routes).
 */
import { clearPendingVisualTab } from "@/lib/navigation/mainTabKeepAlive";
import {
  hasMainTabHistoryPathnameOverride,
  resetMainTabHistoryPathnameStore,
} from "@/lib/navigation/mainTabInternalPathnameStore";
import { clearSoftCommitTxPin } from "@/lib/navigation/mainTabShuffleSoftCommitTxPin";
import {
  clearShuffleExitToMainTab,
  isShuffleExitToMainTabPending,
} from "@/lib/navigation/shuffleHandoffState";
import { reconcileOrphanedShuffleHandoffDom } from "@/lib/navigation/shuffleKeepAlive";
import {
  classifyAppRouteKind,
  isNonMainRoute,
} from "@/lib/navigation/routeKind";

export function neutralizeMainTabPresentationForNonMainRoute(pathname: string) {
  if (!isNonMainRoute(pathname)) return false;

  clearPendingVisualTab();

  if (typeof document !== "undefined") {
    const html = document.documentElement;
    // Shuffle nav already armed reveal-from while live URL is still /u/* (or
    // chat). Do not re-stamp sticky profile/non-main kind over that intent —
    // Android WebView layout effects otherwise win and leave profile content
    // painted while bottom-nav already shows Shuffle.
    const shuffleRevealFrom = html.getAttribute("data-sayittome-shuffle-reveal-from");
    if (shuffleRevealFrom) {
      html.setAttribute("data-sayittome-route-kind", "shuffle");
      reconcileOrphanedShuffleHandoffDom();
      if (isShuffleExitToMainTabPending()) {
        clearShuffleExitToMainTab({ force: true });
      }
      if (hasMainTabHistoryPathnameOverride()) {
        resetMainTabHistoryPathnameStore("non-main-route-isolation-shuffle-reveal");
      }
      clearSoftCommitTxPin("non-main-route-isolation-shuffle-reveal");
      return true;
    }

    const kind = classifyAppRouteKind(pathname);
    html.setAttribute("data-sayittome-route-kind", kind);
    html.classList.remove("sayittome-main-tab-handoff-pending");
    html.removeAttribute("data-sayittome-main-tab-handoff-source");
    html.classList.remove("sayittome-shuffle-handoff-pending");
    html.removeAttribute("data-shuffle-defer-source");
    html.classList.remove("sayittome-shuffle-exit-handoff-pending");
    html.removeAttribute("data-shuffle-exit-handoff-target");
    html.removeAttribute("data-post-settle-route-bridge");
  }

  reconcileOrphanedShuffleHandoffDom();

  if (isShuffleExitToMainTabPending()) {
    // No main-tab destination to settle into — drop the exit latch so Shuffle
    // cannot stay presentation-retained under a profile route.
    clearShuffleExitToMainTab({ force: true });
  }

  if (hasMainTabHistoryPathnameOverride()) {
    resetMainTabHistoryPathnameStore("non-main-route-isolation");
  }

  // Soft-commit pins must not keep BottomNav believing we are still on /shuffle
  // after router.push to /u/[username].
  clearSoftCommitTxPin("non-main-route-isolation");

  return true;
}
