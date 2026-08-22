import {
  activateShuffleTabSurface,
  beginShuffleWarmHandoff,
  isShuffleKeepAliveActive,
  pinShuffleKeepAlive,
} from "@/lib/navigation/shuffleKeepAlive";
import { presentShuffleSurface } from "@/lib/navigation/shuffleHandoffState";
import { presentExistingShuffleSnapshot } from "@/lib/navigation/shuffleForegroundRecover";
import { canHideCurrentShellForShuffle } from "@/lib/navigation/shuffleSnapshotPresent";
import { restoreShuffleViewportSnapshot } from "@/lib/navigation/shuffleViewportSnapshot";
import {
  abortMainTabToShuffleTransition,
  getConcreteMainTabSupersedeEpoch,
  getShuffleRouteCommitEpoch,
  isInternalMainTabToShuffleTransitionActive,
  scheduleShuffleRouteCommit,
} from "@/lib/navigation/mainTabToShuffleTransition";
import { isMainTabToShuffleMicroSlideEnabled } from "@/lib/perf/instantaneityFlags";
import { emitMicroSlideCommitNavDiag } from "@/lib/navigation/mainTabShuffleCommitNavigation";
import { planInstantShuffleEntry } from "@/lib/navigation/instantShuffleEntry";
import {
  shouldHardNavigate,
  shouldHardNavigatePath,
} from "@/lib/navigation/hardNavigate";
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
import { fastRouterPush } from "@/lib/navigation/fastNavigate";
import { ensureShufflePoolWarmForMicroSlide } from "@/lib/shuffle/shufflePoolWarmup";
import {
  prepareShuffleRevealFromNonMainRoute,
  presentShuffleHostForNonMainReveal,
} from "@/lib/navigation/nonMainToShuffleReveal";
import { isNonMainRoute } from "@/lib/navigation/routeKind";

function presentInstantShuffleHostSync() {
  const recovered = presentExistingShuffleSnapshot({ reason: "chats-to-shuffle" });
  restoreShuffleViewportSnapshot();
  if (!recovered.presented || !recovered.snapshotPainted || recovered.hostFrozen) {
    return false;
  }
  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!canHideCurrentShellForShuffle(host)) return false;
  presentShuffleSurface();
  activateShuffleTabSurface({ microSlideSettle: true });
  return true;
}

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
  const plan = planInstantShuffleEntry({
    fromPath: path,
    popstateRestore:
      isHistoryPopstateRestoreInProgress() || triggerType === "popstate-restore",
    microSlideEnabled: isMainTabToShuffleMicroSlideEnabled(),
  });

  observeShuffleNavPointerdown(path, Boolean(options?.blockedDuringSlide));
  traceDryRunIntegration("PREPARE_MAIN_TAB_TO_SHUFFLE", `path=${path}`);
  tracePrepareWarmNavCalled(path);

  // Pin keepalive BEFORE non-main reveal so Shuffle host exists/unfreezes
  // before the profile route shell is released (Android black-frame guard).
  pinShuffleKeepAlive();

  // Own-profile /u/* and settings/edit — clear sticky routeKind + overlays now.
  const fromNonMain = prepareShuffleRevealFromNonMainRoute(path);

  // Cached pool warmup (deduped; no per-click Firestore).
  void ensureShufflePoolWarmForMicroSlide();

  // Popstate/back remount can fire pointerenter over Shuffle — never start a slide.
  if (isHistoryPopstateRestoreInProgress() || !canBeginMicroSlideFromWarmTrigger(triggerType)) {
    emitMicroSlideCommitNavDiag("MICRO_SLIDE_TRANSITION_BEGIN_BLOCKED_POPSTATE", {
      href: "/shuffle",
      reason: `warm-blocked:${triggerType}`,
      forcedSoft: false,
      caller: "beginWarmShuffleTabNavigation",
      commitMode: "history",
    });
    if (!isShuffleKeepAliveActive()) return false;
    const restored = beginShuffleWarmHandoff(path);
    if (plan.presentHostSync) {
      presentInstantShuffleHostSync();
    }
    return restored;
  }

  if (triggerType === "user-main-tab-pointerdown" || triggerType === "user-main-tab-click") {
    armMicroSlideUserClickIntent(path, triggerType);
  }

  // Productive path: never arm WAAPI / stage / deferred commit.
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

  if (plan.presentHostSync) {
    presentInstantShuffleHostSync();
  }

  // Non-main: one RAF backup if pathname commit lands on the next frame.
  if (handoffOk && (fromNonMain || isNonMainRoute(path))) {
    const armActivate = () => {
      const live = window.location.pathname.split("?")[0].split("#")[0];
      if (live !== "/shuffle") return;
      presentInstantShuffleHostSync();
    };
    requestAnimationFrame(armActivate);
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

  const nativeHard =
    typeof window !== "undefined" &&
    shouldHardNavigate() &&
    shouldHardNavigatePath("/shuffle");
  const plan = planInstantShuffleEntry({
    fromPath: path,
    nativeShellHardNavWouldApply: nativeHard,
    microSlideEnabled: isMainTabToShuffleMicroSlideEnabled(),
  });
  const pushOptions = plan.forceHistoryNavigation
    ? {
        forceHistoryNavigation: true as const,
        reason: "instant-shuffle-entry-history",
      }
    : {
        forceSoftNavigation: true as const,
        reason: "instant-shuffle-entry-soft",
      };
  emitMicroSlideCommitNavDiag(
    plan.forceHistoryNavigation
      ? "MICRO_SLIDE_HISTORY_NAVIGATION_REQUIRED"
      : "MICRO_SLIDE_SOFT_NAVIGATION_REQUIRED",
    {
      href: "/shuffle",
      reason: pushOptions.reason,
      forcedSoft: plan.forceSoftNavigation,
      forcedHistory: plan.forceHistoryNavigation,
      caller: "commitPreparedMainTabToShuffleNavigation",
      commitMode: plan.forceHistoryNavigation ? "history" : "soft",
    },
  );

  const epoch = getShuffleRouteCommitEpoch();
  const supersedeEpoch = getConcreteMainTabSupersedeEpoch();
  scheduleShuffleRouteCommit(() => {
    if (epoch !== getShuffleRouteCommitEpoch()) return;
    if (supersedeEpoch !== getConcreteMainTabSupersedeEpoch()) return;
    push(router, "/shuffle", pushOptions);
  }, 0);
}

/**
 * Non-main → Shuffle must commit pathname synchronously.
 * Micro-slide deferral/history modes can no-op while phase is idle on /u/*,
 * and a bare <button> has no href fallback if the click handler races hydration.
 */
export function commitNonMainRouteToShuffleNavigation(
  router: AppRouterInstance,
  push: typeof fastRouterPush = fastRouterPush,
  fromPath?: string,
) {
  if (typeof window === "undefined") return;

  const path =
    fromPath ||
    window.location.pathname.split("?")[0].split("#")[0] ||
    "/";

  if (!isNonMainRoute(path)) {
    commitPreparedMainTabToShuffleNavigation(router, push, path);
    return;
  }

  pinShuffleKeepAlive();
  prepareShuffleRevealFromNonMainRoute(path);
  void ensureShufflePoolWarmForMicroSlide();
  beginShuffleWarmHandoff(path);
  presentInstantShuffleHostSync();
  observeShuffleNavClickCommit(path);
  traceDryRunIntegration("ROUTER_PUSH_SHUFFLE", `path=${path}|nonmain-sync`);
  traceCompleteWarmNavCalled(path);
  traceRouterNavCalled("/shuffle", path);

  const nativeHard = shouldHardNavigate() && shouldHardNavigatePath("/shuffle");
  const plan = planInstantShuffleEntry({
    fromPath: path,
    nativeShellHardNavWouldApply: nativeHard,
    microSlideEnabled: isMainTabToShuffleMicroSlideEnabled(),
  });
  push(
    router,
    "/shuffle",
    plan.forceHistoryNavigation
      ? {
          forceHistoryNavigation: true as const,
          reason: "instant-shuffle-entry-nonmain-history",
        }
      : {
          forceSoftNavigation: true as const,
          reason: "instant-shuffle-entry-nonmain-soft",
        },
  );

  // Same-gesture present already ran. One RAF backup if pathname lands next frame.
  const armActivate = () => {
    const live = window.location.pathname.split("?")[0].split("#")[0];
    const html = document.documentElement;
    const revealing =
      live === "/shuffle" ||
      html.hasAttribute("data-sayittome-shuffle-reveal-pending") ||
      html.getAttribute("data-sayittome-route-kind") === "shuffle";
    if (!revealing) return false;
    presentInstantShuffleHostSync();
    presentShuffleHostForNonMainReveal({ hideShell: live === "/shuffle" });
    const host = document.getElementById("sayittome-shuffle-keepalive-host");
    return !!host?.classList.contains("sayittome-shuffle-keepalive-visible");
  };
  requestAnimationFrame(armActivate);
  let tries = 0;
  const pollId = window.setInterval(() => {
    tries += 1;
    if (armActivate() || tries >= 90) {
      window.clearInterval(pollId);
    }
  }, 32);
  armAndroidShufflePresentationFailsafe(router, push, path);
}

function armAndroidShufflePresentationFailsafe(
  router: AppRouterInstance,
  push: typeof fastRouterPush,
  fromPath?: string,
) {
  if (typeof window === "undefined") return;
  const armedFrom =
    fromPath ||
    window.location.pathname.split("?")[0].split("#")[0] ||
    "/";
  window.setTimeout(() => {
    const live = window.location.pathname.split("?")[0].split("#")[0];
    // Never yank the user off Stories/Chats/Boost/etc. Only recover when still
    // stuck on the armed origin (or a non-main profile/chat route).
    const stillStuckOnOrigin = live === armedFrom || isNonMainRoute(live);
    if (live !== "/shuffle") {
      if (!stillStuckOnOrigin) {
        return;
      }
      if (isInternalMainTabToShuffleTransitionActive()) {
        abortMainTabToShuffleTransition("android-failsafe-commit");
      }
      push(router, "/shuffle", {
        forceSoftNavigation: true,
        reason: "main-tab-to-shuffle-android-failsafe",
      });
    }
    let tries = 0;
    const pollId = window.setInterval(() => {
      tries += 1;
      const now = window.location.pathname.split("?")[0].split("#")[0];
      if (now !== "/shuffle") {
        // User left Shuffle (e.g. Stories) — stop presentation recovery.
        window.clearInterval(pollId);
        return;
      }
      const host = document.getElementById("sayittome-shuffle-keepalive-host");
      const visible = !!host?.classList.contains(
        "sayittome-shuffle-keepalive-visible",
      );
      if (!visible) {
        if (isInternalMainTabToShuffleTransitionActive()) {
          abortMainTabToShuffleTransition("android-failsafe-present");
        }
        const recovered = presentExistingShuffleSnapshot({
          reason: "chats-to-shuffle",
        });
        if (recovered.presented && recovered.snapshotPainted) {
          presentShuffleSurface();
          activateShuffleTabSurface({ microSlideSettle: true });
          const hostNow = document.getElementById(
            "sayittome-shuffle-keepalive-host",
          );
          presentShuffleHostForNonMainReveal({
            hideShell: canHideCurrentShellForShuffle(hostNow),
          });
        }
      }
      if (
        document
          .getElementById("sayittome-shuffle-keepalive-host")
          ?.classList.contains("sayittome-shuffle-keepalive-visible") ||
        tries >= 50
      ) {
        window.clearInterval(pollId);
      }
    }, 50);
  }, 900);
}

/** Click: present host + commit URL in the same gesture. Never defer for readiness/WAAPI. */
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

  if (isNonMainRoute(path)) {
    commitNonMainRouteToShuffleNavigation(router, push, path);
    return;
  }

  presentInstantShuffleHostSync();
  executeShuffleRouteCommit(router, push, path);
  armAndroidShufflePresentationFailsafe(router, push, path);
}

/** Router commit after pointerdown prep — starts destination readiness watch when micro-slide is on. */
export function completeWarmShuffleTabNavigation(
  router: AppRouterInstance,
  push: typeof fastRouterPush = fastRouterPush,
  fromPath?: string,
) {
  commitPreparedMainTabToShuffleNavigation(router, push, fromPath);
}
