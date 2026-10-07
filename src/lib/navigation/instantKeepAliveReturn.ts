/**
 * Instant back/return onto a keep-alive surface.
 * Paint the already-mounted panel before the router commits so the user never
 * sees a loading shell or full-document reload flash.
 */
import { forcePresentMainTabAfterStableExit } from "@/lib/navigation/atomicMainTabHandoff";
import {
  armIncomingBarTab,
  hasMainTabBeenVisited,
  isMainTabKeepAliveActive,
  markMainTabVisited,
  pinMainTabKeepAlive,
} from "@/lib/navigation/mainTabKeepAlive";
import { isMainTabHref, type MainTabHref } from "@/lib/navigation/mainTabs";
import { restoreShuffleFeedScroll } from "@/lib/navigation/shuffleFeedScroll";
import {
  isShuffleKeepAliveActive,
  pinShuffleWindowWhileAway,
  prepareInstantShuffleReturn,
} from "@/lib/navigation/shuffleKeepAlive";
import { presentNativeBarSectionNow } from "@/lib/navigation/stuckTabSurfaceReconcile";

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

/** True when hard document navigation would wipe a painted keep-alive surface. */
export function shouldSkipHardNavigateForKeepAliveReturn(input: {
  href: string;
  shuffleKeepAliveActive?: boolean;
  mainTabKeepAliveActive?: boolean;
}) {
  const path = normalizePath(input.href);
  const shuffleActive =
    input.shuffleKeepAliveActive ??
    (typeof window !== "undefined" ? isShuffleKeepAliveActive() : false);
  const mainActive =
    input.mainTabKeepAliveActive ??
    (typeof window !== "undefined" ? isMainTabKeepAliveActive() : false);

  if (path === "/shuffle") {
    return shuffleActive || mainActive;
  }

  if (!isMainTabHref(path) || path === "/shuffle") return false;

  if (mainActive || shuffleActive) return true;
  if (typeof window !== "undefined" && hasMainTabBeenVisited(path)) return true;
  return false;
}

/** Reveal Shuffle or a concrete main-tab keep-alive panel before route commit. */
export function prepareInstantKeepAliveReturn(href: string) {
  if (typeof window === "undefined") return;

  const path = normalizePath(href);

  if (path === "/shuffle") {
    prepareInstantShuffleReturn();
    restoreShuffleFeedScroll();
    return;
  }

  if (!isMainTabHref(path) || path === "/shuffle") return;

  const tab = path as MainTabHref;
  pinMainTabKeepAlive();
  markMainTabVisited(tab);
  armIncomingBarTab(tab);
  forcePresentMainTabAfterStableExit(tab);
  presentNativeBarSectionNow(tab);

  if (isShuffleKeepAliveActive()) {
    pinShuffleWindowWhileAway();
  }
}
