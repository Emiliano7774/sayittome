"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { recordPathBeforeChatOpen } from "@/lib/navigation/chatBackNavigation";
import { isNavTraceEnabled, navTraceMark } from "@/lib/perf/navTrace";
import {
  beginShuffleWarmHandoff,
  clearInstantShuffleReturn,
  isInstantShuffleReturnDestination,
  isShuffleKeepAliveActive,
  maybePinShuffleKeepAliveFromPath,
  pinShuffleWindowWhileAway,
  prepareInstantShuffleReturn,
} from "@/lib/navigation/shuffleKeepAlive";
import {
  ghostFrameWatchBegin,
  ghostFrameWatchInspect,
} from "@/lib/perf/ghostFrameTrace";
import {
  hardNavigate,
  shouldHardNavigate,
  shouldHardNavigatePath,
} from "@/lib/navigation/hardNavigate";
import { emitMicroSlideCommitNavDiag } from "@/lib/navigation/mainTabShuffleCommitNavigation";
import {
  getSoftCommitTxPin,
  isForceSoftPushModuleReinitForTestEnabled,
  markSoftCommitTxPinInFlight,
} from "@/lib/navigation/mainTabShuffleSoftCommitTxPin";
import { getMainTabShufflePresentationRuntimeInstanceId } from "@/lib/navigation/mainTabShufflePresentationRuntime";
import {
  getMainTabToShuffleTransaction,
  getTransitionModuleInstanceIdForDiag,
} from "@/lib/navigation/mainTabToShuffleTransition";
import { MAIN_TAB_HREFS } from "@/lib/navigation/mainTabs";
import {
  commitMainTabPathnameForHistoryNavigation,
  installMainTabInternalPathnameStore,
  resetMainTabHistoryPathnameStore,
} from "@/lib/navigation/mainTabInternalPathnameStore";

export type FastRouterPushOptions = {
  /** Force same-document router.push, bypassing native-shell hardNavigate for this call only. */
  forceSoftNavigation?: boolean;
  /** Force same-document history.pushState (no Next router.push) for native-shell micro-slide. */
  forceHistoryNavigation?: boolean;
  reason?: string;
};

function pinShuffleWindowIfNeeded(currentPath: string) {
  if (currentPath === "/shuffle" || isShuffleKeepAliveActive()) {
    pinShuffleWindowWhileAway();
  }
}

function normalizeChatHref(href: string) {
  const path = href.split("?")[0].split("#")[0];
  return path.startsWith("/chat/") && path !== "/chat/new";
}

function normalizePath(href: string) {
  return String(href || "/").split("?")[0].split("#")[0] || "/";
}

function isMainTabOrShufflePath(href: string) {
  const path = normalizePath(href);
  return path === "/shuffle" || (MAIN_TAB_HREFS as readonly string[]).includes(path);
}

/** Soft nav away from main tabs must drop history pathname override or keepalive/nav stay stuck. */
function clearStaleMainTabPathnameOverrideForHref(href: string) {
  if (isMainTabOrShufflePath(href)) return;
  resetMainTabHistoryPathnameStore("soft-nav-non-main-tab");
}

function commitHistoryPushState(href: string, reason: string) {
  installMainTabInternalPathnameStore();
  const dest = normalizePath(href);
  const prevPathname =
    typeof window !== "undefined" ? normalizePath(window.location.pathname) : "/";
  const historyLengthBefore =
    typeof window !== "undefined" ? window.history.length : null;
  const tx = typeof window !== "undefined" ? getMainTabToShuffleTransaction() : null;
  const stateKey = `sayittome-micro-slide-history:${tx?.transactionId ?? "none"}:${Date.now()}`;

  if (typeof window === "undefined" || typeof window.history?.pushState !== "function") {
    emitMicroSlideCommitNavDiag("MICRO_SLIDE_HISTORY_NAVIGATION_FAILED", {
      href: dest,
      reason: "pushstate-unavailable",
      forcedSoft: false,
      forcedHistory: true,
      caller: "fastRouterPush",
      commitMode: "history",
      prevPathname,
      nextPathname: dest,
    });
    return false;
  }

  if (dest !== "/shuffle") {
    emitMicroSlideCommitNavDiag("MICRO_SLIDE_HISTORY_COMMIT_BLOCKED", {
      href: dest,
      reason: "destination-not-shuffle",
      forcedSoft: false,
      forcedHistory: true,
      caller: "fastRouterPush",
      commitMode: "history",
      prevPathname,
      nextPathname: dest,
    });
    return false;
  }

  try {
    window.history.pushState(
      {
        __sayittomeMicroSlideHistory: true,
        stateKey,
        txId: tx?.transactionId ?? null,
        sourceTab: tx?.source ?? null,
        prevPathname,
        nextPathname: dest,
      },
      "",
      dest,
    );
  } catch (err) {
    emitMicroSlideCommitNavDiag("MICRO_SLIDE_HISTORY_NAVIGATION_FAILED", {
      href: dest,
      reason: `pushstate-threw:${err instanceof Error ? err.message : "error"}`,
      forcedSoft: false,
      forcedHistory: true,
      caller: "fastRouterPush",
      commitMode: "history",
      prevPathname,
      nextPathname: dest,
      stateKey,
    });
    return false;
  }

  const historyLengthAfter = window.history.length;
  const nextPathname = normalizePath(window.location.pathname);

  emitMicroSlideCommitNavDiag("MICRO_SLIDE_HISTORY_PUSHSTATE_CALLED", {
    href: dest,
    reason,
    forcedSoft: false,
    forcedHistory: true,
    caller: "fastRouterPush",
    commitMode: "history",
    prevPathname,
    nextPathname,
    historyLengthBefore,
    historyLengthAfter,
    stateKey,
    navSeq: tx?.navSeq ?? null,
  });

  commitMainTabPathnameForHistoryNavigation(dest, {
    txId: tx?.transactionId ?? null,
    reason,
  });

  if (nextPathname !== "/shuffle") {
    emitMicroSlideCommitNavDiag("MICRO_SLIDE_HISTORY_NAVIGATION_FAILED", {
      href: dest,
      reason: "url-not-committed",
      forcedSoft: false,
      forcedHistory: true,
      caller: "fastRouterPush",
      commitMode: "history",
      prevPathname,
      nextPathname,
      stateKey,
    });
    return false;
  }

  emitMicroSlideCommitNavDiag("MICRO_SLIDE_HISTORY_URL_COMMITTED", {
    href: dest,
    reason,
    forcedSoft: false,
    forcedHistory: true,
    caller: "fastRouterPush",
    commitMode: "history",
    prevPathname,
    nextPathname,
    historyLengthBefore,
    historyLengthAfter,
    stateKey,
  });
  return true;
}

export function fastRouterPush(
  router: AppRouterInstance,
  href: string,
  options?: FastRouterPushOptions,
) {
  if (isNavTraceEnabled()) {
    navTraceMark("nav-start");
  }

  if (typeof window !== "undefined") {
    const currentPath = window.location.pathname.split("?")[0].split("#")[0];
    maybePinShuffleKeepAliveFromPath(currentPath);

    pinShuffleWindowIfNeeded(currentPath);

    if (isInstantShuffleReturnDestination(href)) {
      if (isNavTraceEnabled()) {
        ghostFrameWatchBegin(`warm:${currentPath}->/shuffle`);
        ghostFrameWatchInspect("fast-nav-prepare");
      }
      beginShuffleWarmHandoff(currentPath);
    }
  }

  if (normalizeChatHref(href)) {
    recordPathBeforeChatOpen();
  }

  const hardNavWouldApply = shouldHardNavigate() && shouldHardNavigatePath(href);

  // Native-shell micro-slide: history.pushState — no Next router.push (avoids realm wipe).
  if (options?.forceHistoryNavigation) {
    const reason = options.reason ?? "force-history-navigation";
    if (hardNavWouldApply) {
      emitMicroSlideCommitNavDiag("MICRO_SLIDE_HARD_NAVIGATION_BYPASSED", {
        href,
        reason,
        forcedSoft: false,
        forcedHistory: true,
        caller: "fastRouterPush",
        commitMode: "history",
      });
    }
    markSoftCommitTxPinInFlight({
      moduleInstanceId: getTransitionModuleInstanceIdForDiag(),
      runtimeInstanceId:
        typeof window !== "undefined" ? getMainTabShufflePresentationRuntimeInstanceId() : null,
      activeTxPresent: Boolean(getSoftCommitTxPin()),
    });
    const ok = commitHistoryPushState(href, reason);
    if (!ok) {
      // Fail closed: do not fall back to router.push/hardNavigate for this micro-slide commit.
      return;
    }
    return;
  }

  // Narrow same-document override: soft router.push (web / non-native micro-slide).
  if (options?.forceSoftNavigation) {
    const reason = options.reason ?? "force-soft-navigation";
    if (hardNavWouldApply) {
      emitMicroSlideCommitNavDiag("MICRO_SLIDE_HARD_NAVIGATION_BYPASSED", {
        href,
        reason,
        forcedSoft: true,
        caller: "fastRouterPush",
        commitMode: "soft",
      });
    }
    emitMicroSlideCommitNavDiag("MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED", {
      href,
      reason,
      forcedSoft: true,
      caller: "fastRouterPush",
      commitMode: "soft",
    });
    markSoftCommitTxPinInFlight({
      moduleInstanceId: getTransitionModuleInstanceIdForDiag(),
      runtimeInstanceId:
        typeof window !== "undefined" ? getMainTabShufflePresentationRuntimeInstanceId() : null,
      activeTxPresent: Boolean(getSoftCommitTxPin()),
    });
    clearStaleMainTabPathnameOverrideForHref(href);
    router.push(href);
    if (isForceSoftPushModuleReinitForTestEnabled()) {
      // Localhost-only prod divergence repro: wipe runtime after soft push, rehydrate from pin.
      queueMicrotask(() => {
        void import("@/lib/navigation/mainTabToShuffleTransition").then((mod) => {
          mod.forceSoftPushModuleReinitForTestOnly();
        });
      });
    }
    return;
  }

  if (hardNavWouldApply) {
    clearStaleMainTabPathnameOverrideForHref(href);
    hardNavigate(href);
    return;
  }

  clearStaleMainTabPathnameOverrideForHref(href);
  router.push(href);
}

export function fastRouterReplace(router: AppRouterInstance, href: string) {
  if (isNavTraceEnabled()) {
    navTraceMark("nav-start");
  }

  if (typeof window !== "undefined") {
    const currentPath = window.location.pathname.split("?")[0].split("#")[0];
    pinShuffleWindowIfNeeded(currentPath);
  }

  if (shouldHardNavigate() && shouldHardNavigatePath(href)) {
    hardNavigate(href);
    return;
  }

  if (isInstantShuffleReturnDestination(href)) {
    prepareInstantShuffleReturn();
    router.replace(href);
    return;
  }

  if (!isShuffleKeepAliveActive()) {
    clearInstantShuffleReturn();
  }

  clearStaleMainTabPathnameOverrideForHref(href);
  router.replace(href);
}
