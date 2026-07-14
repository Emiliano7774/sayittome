"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

import ShuffleRouteContent from "@/app/shuffle/ShuffleRouteContent";
import { commitPresentedMainTabIfReady, isMainTabPrimaryReady } from "@/lib/navigation/atomicMainTabHandoff";
import { clearQueuedShuffleTriggers } from "@/lib/shuffle/shuffleClickBridge";
import {
  beginShuffleExitToMainTab,
  clearShuffleExitToMainTab,
  getShuffleHandoffVersion,
  isShuffleExitToMainTabPending,
  isShuffleSurfacePresented,
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
import { ghostFrameWatchEnd, ghostFrameWatchInspect } from "@/lib/perf/ghostFrameTrace";
import { isMainTabHref, type MainTabHref } from "@/lib/navigation/mainTabs";

const HANDOFF_FRAME_BUDGET = 120;
const NO_LOADING_EXIT_FRAME_BUDGET = 360;
/** Keep polling after soft timeout so a late-ready destination can still release. */
const NO_LOADING_EXIT_ABSOLUTE_BUDGET = 900;

/** Auth destinations must not soft-settle into loading after reveal. */
function requiresStrictPostAuthExit(path: string) {
  return path === "/boost" || path === "/chats";
}

function isStrictNoLoadingReady(
  path: Exclude<MainTabHref, "/shuffle">,
  visual: ReturnType<typeof getTabDestinationVisualReadiness>,
) {
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

  const tick = () => {
    if (token !== exitNoLoadingWatchdogToken) return;
    if (!isShuffleExitToMainTabPending()) return;
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
        }
        return;
      }
      releaseShuffleTabSurface();
      clearShuffleExitToMainTab();
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
    } else {
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

  // Recovery: if an exit latch is left pending (cancelled layout loop) but the
  // destination is already no-loading ready, complete the reveal.
  useEffect(() => {
    if (!isTabShellNoLoadingTransitionContractActive()) return;
    if (!isShuffleExitToMainTabPending()) return;
    const path = pathname.split("?")[0].split("#")[0];
    if (!isMainTabPath(path)) return;

    let cancelled = false;
    let frames = 0;
    const tick = () => {
      if (cancelled) return;
      frames += 1;
      if (!isShuffleExitToMainTabPending()) return;
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
          }
          return;
        }
        releaseShuffleTabSurface();
        clearShuffleExitToMainTab();
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
      }
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useLayoutEffect(() => {
    const path = pathname.split("?")[0].split("#")[0];
    const prev = prevPathRef.current.split("?")[0].split("#")[0];
    prevPathRef.current = pathname;

    if (path === "/shuffle") {
      pinShuffleKeepAlive();
      restorePinnedShuffleWindowSync();
    }

    function startHandoffLoop() {
      handoffLoopRef.current += 1;
      const loopId = handoffLoopRef.current;
      let frames = 0;

      const tryActivate = () => {
        if (handoffLoopRef.current !== loopId) return;
        frames += 1;

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
      handoffLoopRef.current += 1;
      const loopId = handoffLoopRef.current;

      if (isMainTabPath(path)) {
        const contractActive = isTabShellNoLoadingTransitionContractActive();
        const frameBudget = contractActive
          ? NO_LOADING_EXIT_FRAME_BUDGET
          : HANDOFF_FRAME_BUDGET;
        beginShuffleExitToMainTab(path);
        resetTabDestinationReadinessStability(path);
        if (contractActive) {
          if (path === "/boost" || path === "/chats") {
            beginTabPostAuthStabilityTracking(path, {
              source: "/shuffle",
              destination: path,
              via: "shuffle-exit-layout",
            });
          }
          armShuffleExitNoLoadingWatchdog(path, pathname);
          traceTabShellNoLoading("TAB_SHELL_NO_LOADING_SOURCE_FROZEN", {
            source: "/shuffle",
            destination: path,
          });
        }
        let frames = 0;
        let cancelled = false;

        const destinationReady = () => {
          if (contractActive) {
            const visual = getTabDestinationVisualReadiness(path);
            return (
              visual.ready &&
              !visual.hasLoadingShell &&
              !visual.hasVisibleLoadingText &&
              visual.geometryValid &&
              visual.stableFramesReady
            );
          }
          return isMainTabPrimaryReady(path);
        };

        const releaseWhenMainTabReady = () => {
          if (cancelled || handoffLoopRef.current !== loopId) return;
          frames += 1;

          if (destinationReady()) {
            const committed = commitPresentedMainTabIfReady(pathname);
            if (!committed) {
              if (contractActive) {
                traceTabShellNoLoading("TAB_HANDOFF_EXIT_WATCHDOG_BLOCKED_LOADING_RELEASE", {
                  destination: path,
                  frames,
                  via: "layout-exit-loop",
                });
              }
              if (frames < frameBudget || (contractActive && frames < NO_LOADING_EXIT_ABSOLUTE_BUDGET)) {
                requestAnimationFrame(releaseWhenMainTabReady);
              }
              return;
            }
            releaseShuffleTabSurface();
            clearShuffleExitToMainTab();
            pinShuffleWindowWhileAway();
            clearQueuedShuffleTriggers();
            resetShuffleGeometryStability();
            if (contractActive) {
              traceTabShellNoLoading("TAB_SHELL_NO_LOADING_READY", {
                source: "/shuffle",
                destination: path,
                frames,
              });
            }
            return;
          }

          if (frames < frameBudget) {
            if (contractActive && frames % 30 === 0) {
              const visual = getTabDestinationVisualReadiness(path);
              traceTabShellNoLoading("TAB_SHELL_NO_LOADING_DESTINATION_REVEAL_BLOCKED", {
                destination: path,
                reason: visual.reason,
                frames,
              });
            }
            requestAnimationFrame(releaseWhenMainTabReady);
            return;
          }

          // Soft timeout: under no-loading contract, never reveal a loading destination.
          if (contractActive) {
            const visual = getTabDestinationVisualReadiness(path);
            if (frames === frameBudget || frames % 60 === 0) {
              traceTabShellNoLoading("TAB_SHELL_NO_LOADING_DESTINATION_READY_TIMEOUT", {
                destination: path,
                frames,
                visual,
              });
            }
            // Safe settle: destination has no loading chrome — complete reveal even
            // without full stable-frame readiness so the shell does not latch forever.
            // Boost/Chats are excluded: post-auth stability must pass (no soft settle).
            if (
              !requiresStrictPostAuthExit(path) &&
              !visual.hasLoadingShell &&
              !visual.hasVisibleLoadingText &&
              visual.hasContentRoot &&
              visual.geometryValid
            ) {
              const committed = commitPresentedMainTabIfReady(pathname);
              if (!committed) {
                traceTabShellNoLoading("TAB_HANDOFF_EXIT_WATCHDOG_BLOCKED_LOADING_RELEASE", {
                  destination: path,
                  frames,
                  visual,
                  via: "safe-settle",
                });
                if (frames < NO_LOADING_EXIT_ABSOLUTE_BUDGET) {
                  requestAnimationFrame(releaseWhenMainTabReady);
                  return;
                }
                pinShuffleWindowWhileAway();
                clearQueuedShuffleTriggers();
                resetShuffleGeometryStability();
                return;
              }
              releaseShuffleTabSurface();
              clearShuffleExitToMainTab();
              pinShuffleWindowWhileAway();
              clearQueuedShuffleTriggers();
              resetShuffleGeometryStability();
              return;
            }
            if (path === "/boost") {
              traceTabShellNoLoading("TAB_HANDOFF_RELEASE_BLOCKED_BY_BOOST_LOADING", {
                frames,
                reason: visual.reason,
                via: "soft-timeout-no-boost-soft-settle",
              });
            }
            // Still not safe — keep polling until absolute budget.
            if (frames < NO_LOADING_EXIT_ABSOLUTE_BUDGET) {
              requestAnimationFrame(releaseWhenMainTabReady);
              return;
            }
            // Absolute give-up: keep Shuffle frozen; leave exit latch active.
            pinShuffleWindowWhileAway();
            clearQueuedShuffleTriggers();
            resetShuffleGeometryStability();
            return;
          }

          releaseShuffleTabSurface();
          clearShuffleExitToMainTab();
          pinShuffleWindowWhileAway();
          clearQueuedShuffleTriggers();
          resetShuffleGeometryStability();
        };

        requestAnimationFrame(releaseWhenMainTabReady);
        return () => {
          cancelled = true;
          if (contractActive) {
            traceTabShellNoLoading("TAB_SHELL_NO_LOADING_CANCELLED", {
              destination: path,
            });
          }
        };
      }

      releaseShuffleTabSurface();
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
    >
      <div className="sayittome-shuffle-surface-prep" data-shuffle-surface="prep">
        <ShuffleRouteContent />
      </div>
    </div>
  );
}
