import {
  beginShuffleWarmHandoff,
  isShuffleKeepAliveActive,
  pinShuffleKeepAlive,
} from "@/lib/navigation/shuffleKeepAlive";
import {
  abortMainTabToShuffleTransition,
  beginInternalMainTabToShuffleTransition,
  getMainTabToShufflePhase,
  isInternalMainTabToShuffleTransitionActive,
  notifyMainTabToShuffleNavigationCommitted,
  pathToMainTabShuffleSource,
} from "@/lib/navigation/mainTabToShuffleTransition";
import { isMainTabToShuffleMicroSlideEnabled } from "@/lib/perf/instantaneityFlags";
import {
  emitMicroSlideCommitNavDiag,
  getMainTabToShuffleCommitNavigationMode,
  isMicroSlideCommitActiveForShuffle,
} from "@/lib/navigation/mainTabShuffleCommitNavigation";
import {
  observeShuffleNavClickCommit,
  observeShuffleNavPointerdown,
  traceDryRunIntegration,
} from "@/lib/perf/microSlideActivationProbe";
import {
  traceCompleteWarmNavCalled,
  tracePrepareWarmNavCalled,
  traceRouterNavCalled,
} from "@/lib/perf/navInputDiag";
import {
  armMicroSlideUserClickIntent,
  canBeginMicroSlideFromWarmTrigger,
  isHistoryPopstateRestoreInProgress,
  type MicroSlideNavTriggerType,
} from "@/lib/navigation/mainTabShuffleNavIntent";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { getPostSettleBridgeRouteCommitDelayMs } from "@/lib/navigation/postSettleBridgeDiagJitter";
import { fastRouterPush } from "@/lib/navigation/fastNavigate";

/** Begin warm shuffle handoff from the current main-tab path (Chats, Stories, etc.). */
export function beginWarmShuffleTabNavigation(
  fromPath?: string,
  options?: { blockedDuringSlide?: boolean; triggerType?: MicroSlideNavTriggerType },
) {
  if (typeof window === "undefined") return false;

  const path =
    fromPath ||
    window.location.pathname.split("?")[0].split("#")[0] ||
    "/chats";

  const triggerType: MicroSlideNavTriggerType = options?.triggerType ?? "user-main-tab-pointerdown";

  observeShuffleNavPointerdown(path, Boolean(options?.blockedDuringSlide));
  traceDryRunIntegration("PREPARE_MAIN_TAB_TO_SHUFFLE", `path=${path}`);
  tracePrepareWarmNavCalled(path);

  pinShuffleKeepAlive();

  // Popstate/back remount can fire pointerenter over Shuffle — never start micro-slide then.
  if (isHistoryPopstateRestoreInProgress() || !canBeginMicroSlideFromWarmTrigger(triggerType)) {
    emitMicroSlideCommitNavDiag("MICRO_SLIDE_TRANSITION_BEGIN_BLOCKED_POPSTATE", {
      href: "/shuffle",
      reason: `warm-blocked:${triggerType}`,
      forcedSoft: false,
      caller: "beginWarmShuffleTabNavigation",
      commitMode: "history",
    });
    if (!isShuffleKeepAliveActive()) return false;
    return beginShuffleWarmHandoff(path);
  }

  if (triggerType === "user-main-tab-pointerdown" || triggerType === "user-main-tab-click") {
    armMicroSlideUserClickIntent(path, triggerType);
  }

  const source = pathToMainTabShuffleSource(path);
  if (isMainTabToShuffleMicroSlideEnabled() && source) {
    beginInternalMainTabToShuffleTransition(source, { triggerType });
  }

  if (!isShuffleKeepAliveActive()) {
    if (isInternalMainTabToShuffleTransitionActive()) {
      abortMainTabToShuffleTransition("keepalive-inactive");
    }
    return false;
  }

  const handoffOk = beginShuffleWarmHandoff(path);
  if (!handoffOk && isInternalMainTabToShuffleTransitionActive()) {
    abortMainTabToShuffleTransition("handoff-unavailable");
  }
  return handoffOk;
}

/** Pointerdown: register one gesture transaction before router navigation. */
export function prepareMainTabToShuffleNavigation(
  fromPath?: string,
  options?: { blockedDuringSlide?: boolean; triggerType?: MicroSlideNavTriggerType },
) {
  return beginWarmShuffleTabNavigation(fromPath, {
    ...options,
    triggerType: options?.triggerType ?? "user-main-tab-pointerdown",
  });
}

/** Click: commit transaction intent, start readiness ownership, then router push. */
export function commitPreparedMainTabToShuffleNavigation(
  router: AppRouterInstance,
  push: typeof fastRouterPush = fastRouterPush,
  fromPath?: string,
) {
  const path =
    fromPath ||
    (typeof window !== "undefined" ? window.location.pathname.split("?")[0].split("#")[0] : "/chats");
  traceDryRunIntegration("COMPLETE_WARM_SHUFFLE", `path=${path}`);
  traceCompleteWarmNavCalled(path);
  observeShuffleNavClickCommit(path);
  if (isMainTabToShuffleMicroSlideEnabled() && getMainTabToShufflePhase() === "preparing") {
    notifyMainTabToShuffleNavigationCommitted();
  }
  traceDryRunIntegration("ROUTER_PUSH_SHUFFLE", `path=${path}`);
  traceRouterNavCalled("/shuffle", path);

  // Same-document override: only when an active micro-slide transaction owns this /shuffle commit.
  // Native shell → history.pushState; web → soft router.push. Hard nav otherwise untouched.
  const microSlideActive = isMicroSlideCommitActiveForShuffle("/shuffle");
  const modeReport = microSlideActive
    ? getMainTabToShuffleCommitNavigationMode("/shuffle")
    : null;
  const useHistory = modeReport?.effectiveCommitNavigationMode === "history";
  const useSoft =
    modeReport?.effectiveCommitNavigationMode === "soft" ||
    (microSlideActive && !useHistory && modeReport?.microSlideCommitOverrideApplies === true);
  const pushOptions = useHistory
    ? { forceHistoryNavigation: true as const, reason: "main-tab-to-shuffle-micro-slide-history" }
    : useSoft
      ? { forceSoftNavigation: true as const, reason: "main-tab-to-shuffle-micro-slide" }
      : undefined;
  if (useHistory) {
    emitMicroSlideCommitNavDiag("MICRO_SLIDE_HISTORY_NAVIGATION_REQUIRED", {
      href: "/shuffle",
      reason: "main-tab-to-shuffle-micro-slide-history",
      forcedSoft: false,
      forcedHistory: true,
      caller: "commitPreparedMainTabToShuffleNavigation",
      commitMode: "history",
    });
  } else if (useSoft) {
    emitMicroSlideCommitNavDiag("MICRO_SLIDE_SOFT_NAVIGATION_REQUIRED", {
      href: "/shuffle",
      reason: "main-tab-to-shuffle-micro-slide",
      forcedSoft: true,
      caller: "commitPreparedMainTabToShuffleNavigation",
      commitMode: "soft",
    });
  }

  const routeCommitDelayMs = getPostSettleBridgeRouteCommitDelayMs();
  if (routeCommitDelayMs > 0) {
    window.setTimeout(() => push(router, "/shuffle", pushOptions), routeCommitDelayMs);
    return;
  }
  push(router, "/shuffle", pushOptions);
}

/** Router commit after pointerdown prep — starts destination readiness watch when micro-slide is on. */
export function completeWarmShuffleTabNavigation(
  router: AppRouterInstance,
  push: typeof fastRouterPush = fastRouterPush,
  fromPath?: string,
) {
  commitPreparedMainTabToShuffleNavigation(router, push, fromPath);
}
