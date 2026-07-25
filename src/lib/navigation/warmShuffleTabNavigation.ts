import {
  activateShuffleTabSurface,
  beginShuffleWarmHandoff,
  isShuffleKeepAliveActive,
  pinShuffleKeepAlive,
} from "@/lib/navigation/shuffleKeepAlive";
import {
  abortMainTabToShuffleTransition,
  beginInternalMainTabToShuffleTransition,
  getMainTabToShufflePhase,
  getConcreteMainTabSupersedeEpoch,
  getShuffleRouteCommitEpoch,
  isInternalMainTabToShuffleTransitionActive,
  notifyMainTabToShuffleNavigationCommitted,
  pathToMainTabShuffleSource,
  registerDeferredMicroSlideRouteCommit,
  scheduleShuffleRouteCommit,
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
import { ensureShufflePoolWarmForMicroSlide } from "@/lib/shuffle/shufflePoolWarmup";
import { prepareShuffleRevealFromNonMainRoute } from "@/lib/navigation/nonMainToShuffleReveal";
import { isNonMainRoute } from "@/lib/navigation/routeKind";

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

  // Own-profile /u/* and settings/edit are outside micro-slide sources — clear
  // sticky routeKind + profile viewer overlays synchronously (Android WebView).
  const fromNonMain = prepareShuffleRevealFromNonMainRoute(path);

  observeShuffleNavPointerdown(path, Boolean(options?.blockedDuringSlide));
  traceDryRunIntegration("PREPARE_MAIN_TAB_TO_SHUFFLE", `path=${path}`);
  tracePrepareWarmNavCalled(path);

  pinShuffleKeepAlive();
  // Kick existing cached pool warmup early for fresh/anon (deduped; no per-click Firestore).
  void ensureShufflePoolWarmForMicroSlide();

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

  // Non-main (profile/chat) has no micro-slide source — force panel activate on
  // the next frames once /shuffle commits so nav≠content cannot stick.
  if (handoffOk && (fromNonMain || isNonMainRoute(path))) {
    const armActivate = () => {
      if (window.location.pathname.split("?")[0].split("#")[0] !== "/shuffle") {
        return;
      }
      activateShuffleTabSurface();
    };
    requestAnimationFrame(() => {
      armActivate();
      requestAnimationFrame(armActivate);
      window.setTimeout(armActivate, 50);
      window.setTimeout(armActivate, 180);
    });
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

function executeShuffleRouteCommit(
  router: AppRouterInstance,
  push: typeof fastRouterPush,
  path: string,
) {
  traceDryRunIntegration("ROUTER_PUSH_SHUFFLE", `path=${path}`);
  traceRouterNavCalled("/shuffle", path);

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
  const epoch = getShuffleRouteCommitEpoch();
  const supersedeEpoch = getConcreteMainTabSupersedeEpoch();
  scheduleShuffleRouteCommit(() => {
    if (epoch !== getShuffleRouteCommitEpoch()) return;
    if (supersedeEpoch !== getConcreteMainTabSupersedeEpoch()) return;
    // Skip only when a concrete main-tab already won AND the micro-slide is
    // gone. While committing from /chats|/settings|/stories|/boost the live
    // path is still the source until this push runs — do not treat that as
    // supersede.
    if (
      typeof window !== "undefined" &&
      !isInternalMainTabToShuffleTransitionActive() &&
      getMainTabToShufflePhase() === "idle"
    ) {
      const live = window.location.pathname.split("?")[0].split("#")[0];
      if (
        live === "/stories" ||
        live === "/chats" ||
        live === "/boost" ||
        live === "/settings"
      ) {
        return;
      }
    }
    push(router, "/shuffle", pushOptions);
  }, routeCommitDelayMs);
}

/** Click: commit transaction intent, start readiness ownership, defer route until no-loading ready. */
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

  const microSlidePreparing =
    isMainTabToShuffleMicroSlideEnabled() && getMainTabToShufflePhase() === "preparing";

  if (microSlidePreparing) {
    void ensureShufflePoolWarmForMicroSlide();
    notifyMainTabToShuffleNavigationCommitted();
    // NO-LOADING MID-SLIDE: do not navigate into a loading destination.
    // Route commit flushes only when destination visual readiness is ready.
    registerDeferredMicroSlideRouteCommit(() => {
      executeShuffleRouteCommit(router, push, path);
    });
    return;
  }

  executeShuffleRouteCommit(router, push, path);
}

/** Router commit after pointerdown prep — starts destination readiness watch when micro-slide is on. */
export function completeWarmShuffleTabNavigation(
  router: AppRouterInstance,
  push: typeof fastRouterPush = fastRouterPush,
  fromPath?: string,
) {
  commitPreparedMainTabToShuffleNavigation(router, push, fromPath);
}
