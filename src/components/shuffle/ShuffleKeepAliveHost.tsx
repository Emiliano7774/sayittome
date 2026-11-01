"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

import ShuffleRouteContent from "@/app/shuffle/ShuffleRouteContent";
import {
  ShuffleEmergencyShell,
  ShuffleSurfaceErrorBoundary,
} from "@/components/shuffle/ShuffleSurfaceSafety";
import { recordQaCriticalEvent } from "@/lib/qa/realDeviceQaDebug";
import { commitPresentedMainTabIfReady, forcePresentMainTabAfterStableExit, isMainTabPrimaryReady } from "@/lib/navigation/atomicMainTabHandoff";
import { clearQueuedShuffleTriggers } from "@/lib/shuffle/shuffleClickBridge";
import {
  clearShuffleExitToMainTab,
  getShuffleExitMainTabTarget,
  getShuffleHandoffVersion,
  isShuffleExitToMainTabPending,
  isShuffleSurfacePresented,
  registerShuffleExitNoLoadingWatchdogArm,
  subscribeShuffleHandoffState,
} from "@/lib/navigation/shuffleHandoffState";
import {
  beginTabPostAuthStabilityTracking,
  getTabDestinationVisualReadiness,
  isTabShellNoLoadingTransitionContractActive,
  resetTabDestinationReadinessStability,
  traceTabShellNoLoading,
} from "@/lib/navigation/tabDestinationReadiness";
import {
  activateShuffleTabSurface,
  canShowShuffleKeepAliveSurface,
  clearInstantShuffleReturn,
  enterColdShufflePresentation,
  getShuffleKeepAliveVersion,
  hasRestorableWarmShuffleState,
  isInstantShuffleReturnPending,
  isShuffleKeepAliveActive,
  isShuffleSourceRetainedForMainTabExit,
  isValidWarmShuffleHandoffActive,
  pinShuffleKeepAlive,
  pinShuffleWindowWhileAway,
  parkShuffleKeepAliveForNonMainRoute,
  prepareShuffleTabReturn,
  reconcileOrphanedShuffleHandoffDom,
  releaseShuffleTabSurface,
  shouldRenderShuffleKeepAliveHost,
  subscribeShuffleKeepAlive,
} from "@/lib/navigation/shuffleKeepAlive";
import {
  getShuffleWarmReturnVersion,
  canActivateShuffleWarmHandoff,
  observeShuffleGeometryStability,
  resetShuffleGeometryStability,
  subscribeShuffleWarmReturn,
} from "@/lib/shuffle/shuffleWarmVisual";
import { isInternalMainTabToShuffleTransitionActive } from "@/lib/navigation/mainTabToShuffleTransition";
import {
  getCurrentMainTabPathname,
  getMainTabInternalPathnameVersion,
  subscribeMainTabPathname,
} from "@/lib/navigation/mainTabInternalPathnameStore";
import { restorePinnedShuffleWindowSync } from "@/lib/shuffle/shufflePinnedWindow";
import { installShuffleOneFingerFallback } from "@/lib/navigation/shuffleOneFingerFallback";
import { cancelShuffleViewportSnapshotRestore } from "@/lib/navigation/shuffleViewportSnapshot";
import { notifyShuffleFeedUserInput } from "@/lib/navigation/shuffleFeedScroll";
import {
  startShuffleTouchGesture,
  continueShuffleTouchGesture,
  endShuffleTouchGesture,
} from "@/lib/shuffle/shuffleTouchStability";
import { presentExistingShuffleSnapshot } from "@/lib/navigation/shuffleForegroundRecover";
import { ghostFrameWatchEnd, ghostFrameWatchInspect } from "@/lib/perf/ghostFrameTrace";
import { isMainTabHref, type MainTabHref } from "@/lib/navigation/mainTabs";

const HANDOFF_FRAME_BUDGET = 120;
const NO_LOADING_EXIT_FRAME_BUDGET = 360;
/** Keep polling after soft timeout so a late-ready destination can still release. */
const NO_LOADING_EXIT_ABSOLUTE_BUDGET = 900;

/** Auth destinations must not soft-settle into loading after reveal. */
function requiresStrictPostAuthExit(path: string) {
  if (path === "/boost" || path === "/chats") return true;
  // Stories paints "Cargando historias..." without post-auth settle CSS. Under
  // the tab-shell no-loading contract it must wait for destination readiness
  // instead of the non-strict early force-clear path.
  if (
    path === "/stories" &&
    isTabShellNoLoadingTransitionContractActive()
  ) {
    return true;
  }
  return false;
}

/** Match tabDestinationReadiness LOADING_TEXT_RE — includes "Cargando historias...". */
const VISIBLE_LOADING_TEXT_RE = /Cargando(?:\.\.\.)?|Loading(?:\.\.\.)?/i;

function elementVisuallyShowsLoading(el: Element) {
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return (
    rect.width >= 8 &&
    rect.height >= 8 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    parseFloat(style.opacity || "1") >= 0.04
  );
}

function elementLayoutPresent(el: Element) {
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return (
    rect.width >= 8 &&
    rect.height >= 8 &&
    style.display !== "none" &&
    // Treat handoff/settle CSS hide as still "loading present" for release gates.
    style.visibility !== "collapse"
  );
}

function hostHasVisuallyVisibleLoading(host: HTMLElement | null) {
  if (!host) return false;
  const nodes = host.querySelectorAll(
    "[data-loading-shell], [data-nav-loading-copy], [data-boost-access-state='loading']",
  );
  for (const el of nodes) {
    if (elementVisuallyShowsLoading(el)) return true;
  }
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const t = node.textContent?.trim() || "";
    if (VISIBLE_LOADING_TEXT_RE.test(t)) {
      const parent = node.parentElement;
      if (parent && elementVisuallyShowsLoading(parent)) return true;
    }
    node = walker.nextNode();
  }
  return false;
}

/** Layout-present loading (ignores exit/handoff visibility:hidden). */
function hostHasLayoutPresentLoading(host: HTMLElement | null) {
  if (!host) return false;
  const nodes = host.querySelectorAll(
    "[data-loading-shell], [data-nav-loading-copy], [data-boost-access-state='loading']",
  );
  for (const el of nodes) {
    if (elementLayoutPresent(el)) return true;
  }
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const t = node.textContent?.trim() || "";
    if (VISIBLE_LOADING_TEXT_RE.test(t)) {
      const parent = node.parentElement;
      if (parent && elementLayoutPresent(parent)) return true;
    }
    node = walker.nextNode();
  }
  return false;
}

/** Visible-only loading (respects settle/handoff CSS hide). */
function hasVisuallyVisibleDestinationLoading(
  path: Exclude<MainTabHref, "/shuffle">,
) {
  if (typeof document === "undefined") return false;
  const host = document.getElementById(
    `sayittome-main-tab-keepalive-${path.slice(1)}`,
  );
  return hostHasVisuallyVisibleLoading(host as HTMLElement | null);
}

function hasVisuallyVisibleShuffleLoading() {
  if (typeof document === "undefined") return false;
  return hostHasVisuallyVisibleLoading(
    document.getElementById("sayittome-shuffle-keepalive-host"),
  );
}

function forceReleaseShuffleExitIfNoVisibleLoading(
  path: Exclude<MainTabHref, "/shuffle">,
  frames: number,
  via: string,
) {
  // Never clear while the destination still shows user-visible loading.
  if (hasVisuallyVisibleDestinationLoading(path)) {
    return false;
  }
  // Shuffle stays painted under exit CSS. Waiting on Shuffle loading forever
  // deadlocks Stories (host frozen, sampled=0). After soft budget, allow
  // Stories release despite Shuffle loading — releaseShuffleTabSurface hides it.
  // Before soft budget, still block (BOTH_LOADING_VISIBLE risk on early clear).
  if (
    hasVisuallyVisibleShuffleLoading() &&
    !(path === "/stories" && frames >= NO_LOADING_EXIT_FRAME_BUDGET)
  ) {
    return false;
  }
  if (path === "/stories") {
    const host = document.getElementById(
      "sayittome-main-tab-keepalive-stories",
    ) as HTMLElement | null;
    if (hostHasLayoutPresentLoading(host)) return false;
  }
  forcePresentMainTabAfterStableExit(path);
  releaseShuffleTabSurface();
  clearShuffleExitToMainTab({ destination: path, force: true });
  pinShuffleWindowWhileAway();
  clearQueuedShuffleTriggers();
  resetShuffleGeometryStability();
  traceTabShellNoLoading("TAB_HANDOFF_EXIT_WATCHDOG_FORCE_PRESENT_NO_LOADING", {
    destination: path,
    frames,
    via,
  });
  return true;
}

function isStrictNoLoadingReady(
  path: Exclude<MainTabHref, "/shuffle">,
  visual: ReturnType<typeof getTabDestinationVisualReadiness>,
) {
  if (path === "/stories") {
    const host =
      typeof document !== "undefined"
        ? (document.getElementById(
            "sayittome-main-tab-keepalive-stories",
          ) as HTMLElement | null)
        : null;
    // Exit/handoff CSS hides [data-nav-loading-copy]; do not treat that as ready.
    if (hostHasLayoutPresentLoading(host)) return false;
  }
  if (requiresStrictPostAuthExit(path)) {
    return (
      visual.ready &&
      visual.stableFramesReady &&
      !visual.hasLoadingShell &&
      !visual.hasVisibleLoadingText &&
      visual.geometryValid
    );
  }
  return (
    visual.ready ||
    (!visual.hasLoadingShell &&
      !visual.hasVisibleLoadingText &&
      visual.hasContentRoot &&
      visual.geometryValid)
  );
}

/** Module-level watchdog survives React effect cancellation / remounts. */
let exitNoLoadingWatchdogToken = 0;

function armShuffleExitNoLoadingWatchdog(
  path: Exclude<MainTabHref, "/shuffle">,
  pathnameForCommit: string,
) {
  exitNoLoadingWatchdogToken += 1;
  const token = exitNoLoadingWatchdogToken;
  let frames = 0;

  let waitingVisible: (() => void) | null = null;
  const clearVisibleWait = () => {
    if (!waitingVisible) return;
    document.removeEventListener("visibilitychange", waitingVisible);
    waitingVisible = null;
  };
  const tick = () => {
    if (token !== exitNoLoadingWatchdogToken) {
      clearVisibleWait();
      return;
    }
    if (!isShuffleExitToMainTabPending()) {
      clearVisibleWait();
      return;
    }
    // Do not spin 900 rAF frames while the app is backgrounded (phone call /
    // multi-task). Resume when the WebView is visible again.
    if (typeof document !== "undefined" && document.hidden) {
      if (waitingVisible) return;
      waitingVisible = () => {
        clearVisibleWait();
        if (token === exitNoLoadingWatchdogToken) requestAnimationFrame(tick);
      };
      document.addEventListener("visibilitychange", waitingVisible);
      return;
    }
    frames += 1;

    const visual = getTabDestinationVisualReadiness(path);
    const safe = isStrictNoLoadingReady(path, visual);

    if (safe) {
      const committed = commitPresentedMainTabIfReady(pathnameForCommit);
      if (!committed) {
        traceTabShellNoLoading("TAB_HANDOFF_EXIT_WATCHDOG_BLOCKED_LOADING_RELEASE", {
          destination: path,
          frames,
          visual,
          via: "module-exit-watchdog",
        });
        if (path === "/boost") {
          traceTabShellNoLoading("TAB_HANDOFF_RELEASE_BLOCKED_BY_BOOST_LOADING", {
            frames,
            reason: visual.reason,
            via: "module-exit-watchdog",
          });
        }
        if (frames < NO_LOADING_EXIT_ABSOLUTE_BUDGET) {
          requestAnimationFrame(tick);
        } else if (
          !forceReleaseShuffleExitIfNoVisibleLoading(
            path,
            frames,
            "module-exit-watchdog-absolute",
          )
        ) {
          traceTabShellNoLoading("TAB_SHELL_NO_LOADING_DESTINATION_READY_TIMEOUT", {
            destination: path,
            frames,
            visual,
            via: "module-exit-watchdog",
          });
        }
        return;
      }
      releaseShuffleTabSurface();
      clearShuffleExitToMainTab({ destination: path, force: true });
      pinShuffleWindowWhileAway();
      clearQueuedShuffleTriggers();
      resetShuffleGeometryStability();
      traceTabShellNoLoading("TAB_SHELL_NO_LOADING_READY", {
        source: "/shuffle",
        destination: path,
        frames,
        via: "module-exit-watchdog",
      });
      return;
    }

    if (frames < NO_LOADING_EXIT_ABSOLUTE_BUDGET) {
      requestAnimationFrame(tick);
    } else if (
      !forceReleaseShuffleExitIfNoVisibleLoading(
        path,
        frames,
        "module-exit-watchdog-absolute-unready",
      )
    ) {
      traceTabShellNoLoading("TAB_SHELL_NO_LOADING_DESTINATION_READY_TIMEOUT", {
        destination: path,
        frames,
        visual,
        via: "module-exit-watchdog",
      });
    }
  };

  requestAnimationFrame(tick);
}

registerShuffleExitNoLoadingWatchdogArm(armShuffleExitNoLoadingWatchdog);

function isMainTabPath(path: string): path is Exclude<MainTabHref, "/shuffle"> {
  return isMainTabHref(path) && path !== "/shuffle";
}

export default function ShuffleKeepAliveHost() {
  const nextPathname = usePathname();
  useSyncExternalStore(
    subscribeMainTabPathname,
    getMainTabInternalPathnameVersion,
    getMainTabInternalPathnameVersion,
  );
  const pathname = getCurrentMainTabPathname(nextPathname);
  const prevPathRef = useRef(pathname);
  const handoffLoopRef = useRef(0);

  useSyncExternalStore(
    subscribeShuffleKeepAlive,
    getShuffleKeepAliveVersion,
    getShuffleKeepAliveVersion,
  );

  useSyncExternalStore(
    subscribeShuffleWarmReturn,
    getShuffleWarmReturnVersion,
    getShuffleWarmReturnVersion,
  );

  useSyncExternalStore(
    subscribeShuffleHandoffState,
    getShuffleHandoffVersion,
    getShuffleHandoffVersion,
  );

  const visible =
    canShowShuffleKeepAliveSurface(pathname) ||
    isInstantShuffleReturnPending() ||
    isShuffleSourceRetainedForMainTabExit();

  useLayoutEffect(() => {
    pinShuffleKeepAlive();
    recordQaCriticalEvent("nav", "SHUFFLE_HOST_MOUNT", {
      pathname: window.location.pathname,
    });
  }, []);

  useEffect(() => {
    // Native compositor scroll wins; rescue only when a one-finger pan stalls.
    const host = document.getElementById("sayittome-shuffle-keepalive-host");
    if (!host) return;
    host.dataset.shuffleTouchFallbackStatus = "installed";
    const remove = installShuffleOneFingerFallback(host);
    return () => {
      remove();
      delete host.dataset.shuffleTouchFallbackStatus;
    };
  }, [pathname, visible]);
  useEffect(() => {
    // A late snapshot-restore rAF must never override a real Android swipe.
    // Capture in the document so it also works after the keep-alive host mounts.
    let touchingShuffle = false;
    let cancelledTouchReleaseTimer: number | null = null;
    const clearCancelledTouchRelease = () => {
      if (cancelledTouchReleaseTimer === null) return;
      window.clearTimeout(cancelledTouchReleaseTimer);
      cancelledTouchReleaseTimer = null;
    };
    const deferCancelledTouchRelease = () => {
      clearCancelledTouchRelease();
      // Some Android WebViews send touchcancel when compositor panning takes
      // over, but never dispatch scrollend. Never hold the feed frozen for
      // the 12-second emergency timeout when scrolling has stopped.
      cancelledTouchReleaseTimer = window.setTimeout(() => {
        cancelledTouchReleaseTimer = null;
        endShuffleTouchGesture();
      }, 650);
    };
    const onTouchStart = (event: TouchEvent) => {
      touchingShuffle = Boolean(
        event.target instanceof Element &&
        event.target.closest("#sayittome-shuffle-keepalive-host main[data-scroll-root]")
      );
      if (!touchingShuffle) return;
      clearCancelledTouchRelease();
      cancelShuffleViewportSnapshotRestore();
      notifyShuffleFeedUserInput();
      startShuffleTouchGesture();
    };
    const onTouchMove = () => {
      // The gesture lock itself prevents every restore until finger-up.
      // Do not invalidate scroll-restore generations on every touch frame.
      if (touchingShuffle) continueShuffleTouchGesture();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (touchingShuffle) notifyShuffleFeedUserInput();
      if (event.type === "touchcancel") {
        // Chromium may cancel DOM touch events when native compositor scrolling
        // takes over. This is not finger-up: keep cards/restore locked until
        // scrollend, rather than unmounting the original touch target mid-pan.
        touchingShuffle = false;
        deferCancelledTouchRelease();
        return;
      }
      if (event.touches.length === 0) {
        touchingShuffle = false;
        clearCancelledTouchRelease();
        endShuffleTouchGesture();
      }
    };
    const onNativeScroll = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.matches("#sayittome-shuffle-keepalive-host main[data-scroll-root]")
      ) {
        continueShuffleTouchGesture();
        if (cancelledTouchReleaseTimer !== null) deferCancelledTouchRelease();
      }
    };
    const onNativeScrollEnd = (event: Event) => {
      if (
        !touchingShuffle &&
        event.target instanceof Element &&
        event.target.matches("#sayittome-shuffle-keepalive-host main[data-scroll-root]")
      ) {
        clearCancelledTouchRelease();
        endShuffleTouchGesture();
      }
    };
    document.addEventListener("scroll", onNativeScroll, { passive: true, capture: true });
    document.addEventListener("scrollend", onNativeScrollEnd, { passive: true, capture: true });
    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true, capture: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });
    return () => {
      document.removeEventListener("scroll", onNativeScroll, true);
      document.removeEventListener("scrollend", onNativeScrollEnd, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      clearCancelledTouchRelease();
      endShuffleTouchGesture();
    };
  }, []);

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      const path = pathname.split("?")[0].split("#")[0];
      if (path !== "/shuffle") return;
      if (isValidWarmShuffleHandoffActive()) return;
      enterColdShufflePresentation();
    }

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [pathname]);

  useEffect(() => {
    const path = pathname.split("?")[0].split("#")[0];
    if (path !== "/shuffle" || !visible) return;
    recordQaCriticalEvent("nav", "SHUFFLE_SHELL_VISIBLE", {
      hostMounted: true,
    });
  }, [pathname, visible]);

  // Recovery: if an exit latch is left pending (cancelled layout loop) but the
  // destination is already no-loading ready, complete the reveal.
  useEffect(() => {
    if (!isTabShellNoLoadingTransitionContractActive()) return;
    if (!isShuffleExitToMainTabPending()) return;
    const path = pathname.split("?")[0].split("#")[0];
    if (!isMainTabPath(path)) return;

    let cancelled = false;
    let frames = 0;
    let waitingVisible: (() => void) | null = null;
    const clearVisibleWait = () => {
      if (!waitingVisible) return;
      document.removeEventListener("visibilitychange", waitingVisible);
      waitingVisible = null;
    };
    const tick = () => {
      if (cancelled) return;
      if (!isShuffleExitToMainTabPending()) return;
      if (typeof document !== "undefined" && document.hidden) {
        if (waitingVisible) return;
        waitingVisible = () => {
          clearVisibleWait();
          if (!cancelled) requestAnimationFrame(tick);
        };
        document.addEventListener("visibilitychange", waitingVisible);
        return;
      }
      frames += 1;
      const visual = getTabDestinationVisualReadiness(path);
      const safe = isStrictNoLoadingReady(path, visual);
      if (safe) {
        const committed = commitPresentedMainTabIfReady(pathname);
        if (!committed) {
          traceTabShellNoLoading("TAB_HANDOFF_EXIT_WATCHDOG_BLOCKED_LOADING_RELEASE", {
            destination: path,
            frames,
            visual,
            via: "exit-recovery-effect",
          });
          if (path === "/boost") {
            traceTabShellNoLoading("TAB_HANDOFF_RELEASE_BLOCKED_BY_BOOST_LOADING", {
              frames,
              reason: visual.reason,
              via: "exit-recovery-effect",
            });
          }
          if (frames < NO_LOADING_EXIT_ABSOLUTE_BUDGET) {
            requestAnimationFrame(tick);
          } else {
            forceReleaseShuffleExitIfNoVisibleLoading(
              path,
              frames,
              "exit-recovery-effect-absolute",
            );
          }
          return;
        }
        releaseShuffleTabSurface();
        clearShuffleExitToMainTab({ destination: path, force: true });
        pinShuffleWindowWhileAway();
        clearQueuedShuffleTriggers();
        resetShuffleGeometryStability();
        traceTabShellNoLoading("TAB_SHELL_NO_LOADING_READY", {
          source: "/shuffle",
          destination: path,
          frames,
          via: "exit-recovery-effect",
        });
        return;
      }
      if (frames < NO_LOADING_EXIT_ABSOLUTE_BUDGET) {
        requestAnimationFrame(tick);
      } else {
        forceReleaseShuffleExitIfNoVisibleLoading(
          path,
          frames,
          "exit-recovery-effect-absolute-unready",
        );
      }
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      clearVisibleWait();
    };
  }, [pathname]);

  useLayoutEffect(() => {
    const path = pathname.split("?")[0].split("#")[0];
    const prev = prevPathRef.current.split("?")[0].split("#")[0];
    prevPathRef.current = pathname;

    // Returning from a chat via history.replaceState can leave prevPathRef
    // already pointing at /chat on the NEXT entrance. Never require prev
    // === "/shuffle" to park the Shuffle host once a real chat/profile owns
    // the live URL; otherwise the opaque Shuffle surface covers the chat.
    if (
      (path.startsWith("/chat/") || path.startsWith("/u/")) &&
      !isInstantShuffleReturnPending() &&
      !document.documentElement.hasAttribute("data-sayittome-shuffle-reveal-from") &&
      !document.documentElement.hasAttribute("data-sayittome-shuffle-reveal-pending")
    ) {
      parkShuffleKeepAliveForNonMainRoute();
    }

    // Recover stuck Shuffle presentation / exit latch when the live route is
    // already a concrete main tab. History pathname sync can re-enter this
    // effect and cancel the exit rAF loop after prevPathRef advanced past
    // /shuffle, leaving sayittome-shuffle-exit-handoff-pending forever.
    const exitTarget = getShuffleExitMainTabTarget();
    if (
      isMainTabPath(path) &&
      !isInternalMainTabToShuffleTransitionActive() &&
      (isShuffleExitToMainTabPending() || isShuffleSurfacePresented()) &&
      (!exitTarget || exitTarget === path)
    ) {
      forcePresentMainTabAfterStableExit(path);
      releaseShuffleTabSurface();
      clearShuffleExitToMainTab({ destination: path, force: true });
      pinShuffleWindowWhileAway();
      clearQueuedShuffleTriggers();
      resetShuffleGeometryStability();
    }

    if (path === "/shuffle") {
      pinShuffleKeepAlive();
      restorePinnedShuffleWindowSync();
      recordQaCriticalEvent("nav", "ACTIVE_PANEL_SET", {
        panel: "shuffle",
        visible,
      });
    }

    function startHandoffLoop() {
      handoffLoopRef.current += 1;
      const loopId = handoffLoopRef.current;
      let frames = 0;

      const tryActivate = () => {
        if (handoffLoopRef.current !== loopId) return;
        frames += 1;
        // Drop stale activate frames once the live route left /shuffle.
        const livePath =
          typeof window !== "undefined"
            ? window.location.pathname.split("?")[0].split("#")[0]
            : path;
        if (livePath !== "/shuffle" || isShuffleExitToMainTabPending()) {
          return;
        }

        restorePinnedShuffleWindowSync();

        if (!isValidWarmShuffleHandoffActive()) {
          if (hasRestorableWarmShuffleState()) {
            prepareShuffleTabReturn();
          }
          return;
        }

        if (canActivateShuffleWarmHandoff()) {
          activateShuffleTabSurface();
          requestAnimationFrame(() => ghostFrameWatchEnd());
          return;
        }

        const stable = observeShuffleGeometryStability();
        ghostFrameWatchInspect(stable ? "shuffle-geometry-stable" : `shuffle-geometry-wait:${frames}`);

        if (stable && canActivateShuffleWarmHandoff()) {
          activateShuffleTabSurface();
          requestAnimationFrame(() => ghostFrameWatchEnd());
          return;
        }

        if (frames < HANDOFF_FRAME_BUDGET) {
          requestAnimationFrame(tryActivate);
        }
      };

      requestAnimationFrame(tryActivate);
    }

    if (path === "/shuffle" && isShuffleKeepAliveActive()) {
      if (isInternalMainTabToShuffleTransitionActive()) {
        return;
      }

      if (prev.startsWith("/u/") || isInstantShuffleReturnPending()) {
        const hopRecovered = presentExistingShuffleSnapshot({
          reason: "shuffle-profile-hop",
        });
        if (hopRecovered.presented) {
          reconcileOrphanedShuffleHandoffDom();
          return;
        }
      }

      const warmHandoff = isValidWarmShuffleHandoffActive();

      if (!isShuffleSurfacePresented()) {
        if (prev !== "/shuffle") {
          if (hasRestorableWarmShuffleState()) {
            prepareShuffleTabReturn();
            startHandoffLoop();
          } else {
            enterColdShufflePresentation();
          }
        } else if (!isInstantShuffleReturnPending()) {
          if (warmHandoff) {
            startHandoffLoop();
          } else {
            enterColdShufflePresentation();
          }
        }
      } else {
        reconcileOrphanedShuffleHandoffDom();
      }
    } else if (prev === "/shuffle" && path !== "/shuffle" && isShuffleKeepAliveActive()) {
      if (isMainTabPath(path)) {
        // The tapped section is already mounted. Waiting for its loading text
        // keeps Shuffle, or the previous Chats screen, painted.
        forcePresentMainTabAfterStableExit(path);
        releaseShuffleTabSurface();
        clearShuffleExitToMainTab({ destination: path, force: true });
        pinShuffleWindowWhileAway();
        clearQueuedShuffleTriggers();
        resetShuffleGeometryStability();
        return;
      }

      parkShuffleKeepAliveForNonMainRoute();
      pinShuffleWindowWhileAway();
      clearQueuedShuffleTriggers();
      resetShuffleGeometryStability();
    } else if (
      prev.startsWith("/chat/") &&
      path.startsWith("/u/") &&
      isShuffleKeepAliveActive()
    ) {
      pinShuffleWindowWhileAway();
    }

    if (path === "/shuffle" && isInstantShuffleReturnPending()) {
      requestAnimationFrame(() => clearInstantShuffleReturn());
    }
  }, [pathname]);

  if (!shouldRenderShuffleKeepAliveHost(pathname)) {
    return null;
  }

  return (
    <div
      id="sayittome-shuffle-keepalive-host"
      className={
        visible
          ? "sayittome-shuffle-keepalive-visible"
          : "sayittome-shuffle-keepalive-frozen"
      }
      aria-hidden={!visible}
      style={{ position: "fixed", inset: 0, background: "#0b0b0b" }}
    >
      <ShuffleEmergencyShell />
      <div
        className="sayittome-shuffle-surface-prep relative z-[1]"
        data-shuffle-surface="prep"
      >
        <ShuffleSurfaceErrorBoundary>
          <ShuffleRouteContent />
        </ShuffleSurfaceErrorBoundary>
      </div>
    </div>
  );
}
