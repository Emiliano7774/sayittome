"use client";

/**
 * Same-document pathname signal for main-tab → Shuffle history commits.
 * history.pushState updates window.location.pathname but not Next usePathname.
 * This store bridges that gap for bottom nav + keep-alive hosts only.
 * Not sessionStorage / localStorage product state.
 */

import { emitMicroSlideCommitNavDiag } from "@/lib/navigation/mainTabShuffleCommitNavigation";
import {
  isHistoryPopstateRestoreInProgress,
  markHistoryPopstateRestoreInProgress,
} from "@/lib/navigation/mainTabShuffleNavIntent";
import {
  clearSoftCommitTxPin,
  getSoftCommitTxPin,
} from "@/lib/navigation/mainTabShuffleSoftCommitTxPin";
import { MAIN_TAB_HREFS } from "@/lib/navigation/mainTabs";
import { isNonMainRoute } from "@/lib/navigation/routeKind";

export const MAIN_TAB_HISTORY_COMMIT_EVENT = "sayittome:main-tab-history-commit";

type PathnameListener = () => void;

let overridePathname: string | null = null;
let version = 0;
const listeners = new Set<PathnameListener>();
let popstateInstalled = false;

function normalizePath(href: string) {
  return String(href || "/").split("?")[0].split("#")[0] || "/";
}

function locationPathname() {
  if (typeof window === "undefined") return "/";
  return normalizePath(window.location.pathname);
}

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

export function getMainTabInternalPathnameVersion() {
  return version;
}

export function subscribeMainTabPathname(listener: PathnameListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Effective pathname for main-tab presentation.
 * History override leads only while soft-commit is in flight or it matches
 * window.location (pushState). Otherwise prefer the live URL so soft navigations
 * to /u/... or /chat/... cannot leave keepalive stuck on a prior main tab.
 */
export function getCurrentMainTabPathname(fallback?: string | null) {
  const loc = typeof window !== "undefined" ? locationPathname() : null;
  const fb = fallback ? normalizePath(fallback) : null;
  // Live /shuffle wins over stale soft-commit overrides — bottom nav must offer
  // "Cambiar perfiles" (reshuffle), not re-arm Chats→Shuffle navigation.
  if (loc === "/shuffle") {
    return "/shuffle";
  }
  const locIsConcreteMainTab =
    !!loc &&
    (MAIN_TAB_HREFS as readonly string[]).includes(loc) &&
    loc !== "/shuffle";

  if (overridePathname) {
    const pin = typeof window !== "undefined" ? getSoftCommitTxPin() : null;
    // Soft-commit pin must not keep /shuffle (or another tab) after the browser
    // URL already landed on a concrete main tab — that freezes all keep-alive
    // panels while the selected nav shows Stories/Chats/etc.
    if (locIsConcreteMainTab && overridePathname !== loc) {
      return loc;
    }
    // PROFILE_ROUTE_MAIN_TAB_LEAK: live /u/* (and other non-main) wins over an
    // in-flight soft-commit pin that still claims /shuffle or a prior tab.
    if (loc && isNonMainRoute(loc) && overridePathname !== loc) {
      return loc;
    }
    if (pin?.isSoftCommitInFlight) return overridePathname;
    if (loc && overridePathname === loc) return overridePathname;
    // Stale override after soft router.push away from main tabs (e.g. /chats → /u/...).
    if (loc && overridePathname !== loc) return loc;
    return overridePathname;
  }

  // Prefer live URL when Next usePathname lags one tick after soft push.
  if (loc && fb && loc !== fb) return loc;
  if (fb) return fb;
  return loc ?? "/";
}

export function hasMainTabHistoryPathnameOverride() {
  return overridePathname !== null;
}

export function commitMainTabPathnameForHistoryNavigation(
  nextPath: string,
  extras?: { txId?: string | null; reason?: string },
) {
  const prev = getCurrentMainTabPathname();
  const next = normalizePath(nextPath);
  overridePathname = next;
  notify();
  emitMicroSlideCommitNavDiag("MAIN_TAB_HISTORY_PATHNAME_STORE_UPDATED", {
    href: next,
    reason: extras?.reason ?? "history-commit",
    forcedSoft: false,
    caller: "commitMainTabPathnameForHistoryNavigation",
    prevPathname: prev,
    nextPathname: next,
    transactionIdOverride: extras?.txId ?? null,
    commitMode: "history",
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(MAIN_TAB_HISTORY_COMMIT_EVENT, {
        detail: {
          prevPathname: prev,
          nextPathname: next,
          txId: extras?.txId ?? null,
        },
      }),
    );
  }
}

export function resetMainTabHistoryPathnameStore(reason: string) {
  if (overridePathname === null) return;
  const prev = overridePathname;
  overridePathname = null;
  notify();
  emitMicroSlideCommitNavDiag("MAIN_TAB_HISTORY_PATHNAME_STORE_RESET", {
    href: locationPathname(),
    reason,
    forcedSoft: false,
    caller: "resetMainTabHistoryPathnameStore",
    prevPathname: prev,
    nextPathname: locationPathname(),
    commitMode: "history",
  });
}

function onPopState() {
  const path = locationPathname();
  const prev = overridePathname;
  // Always sync override to real location after browser back/forward.
  overridePathname = path;
  markHistoryPopstateRestoreInProgress({ pathname: path, prevPathname: prev });
  notify();
  emitMicroSlideCommitNavDiag("MAIN_TAB_HISTORY_PATHNAME_STORE_POPSTATE", {
    href: path,
    reason: "popstate",
    forcedSoft: false,
    caller: "mainTabInternalPathnameStore.onPopState",
    prevPathname: prev,
    nextPathname: path,
    commitMode: "history",
  });
  emitMicroSlideCommitNavDiag("MICRO_SLIDE_HISTORY_POPSTATE_BRIDGE_READY", {
    href: path,
    reason: "popstate-sync",
    forcedSoft: false,
    caller: "mainTabInternalPathnameStore.onPopState",
    prevPathname: prev,
    nextPathname: path,
    commitMode: "history",
  });

  // Fail-closed: never leave a preparing pin after restore when there is no
  // in-flight soft commit (settled hop + remount must not keep a stale pin).
  const pin = getSoftCommitTxPin();
  if (pin && !pin.isSoftCommitInFlight && (pin.phase === "preparing" || path !== "/shuffle")) {
    clearSoftCommitTxPin("history-popstate-restore", {
      activeTxPresent: false,
    });
    emitMicroSlideCommitNavDiag("MICRO_SLIDE_STALE_PIN_CLEARED_NO_TX", {
      href: path,
      reason: "history-popstate-restore",
      forcedSoft: false,
      caller: "mainTabInternalPathnameStore.onPopState",
      transactionIdOverride: pin.txId,
      commitMode: "history",
    });
  }

  // Abort in-flight micro-slide if user navigates away mid-tx via back/forward.
  void import("@/lib/navigation/mainTabToShuffleTransition").then((mod) => {
    if (isHistoryPopstateRestoreInProgress() && !mod.isInternalMainTabToShuffleTransitionActive()) {
      emitMicroSlideCommitNavDiag("HISTORY_BACK_FORWARD_PIN_GUARD_PASS", {
        href: path,
        reason: "restore-only-no-active-tx",
        forcedSoft: false,
        caller: "mainTabInternalPathnameStore.onPopState",
        commitMode: "history",
      });
      return;
    }
    if (!mod.isInternalMainTabToShuffleTransitionActive()) return;
    if (path === "/shuffle") return;
    mod.abortMainTabToShuffleTransition("history-popstate-during-tx");
  });
}

function syncPathnameStoreFromLiveLocation(reason: string) {
  const path = locationPathname();
  const prev = overridePathname;
  if (prev !== path) {
    overridePathname = path;
  }
  // Always notify: Next usePathname can lag behind history.pushState/router
  // soft navigations, leaving keep-alive hosts stuck on /shuffle while the
  // live URL is already /stories (both main panels frozen, Shuffle still up).
  notify();
  if (prev !== path) {
    emitMicroSlideCommitNavDiag("MAIN_TAB_HISTORY_PATHNAME_STORE_UPDATED", {
      href: path,
      reason,
      forcedSoft: false,
      caller: "syncPathnameStoreFromLiveLocation",
      prevPathname: prev,
      nextPathname: path,
      commitMode: "history",
    });
  }
}

export function installMainTabInternalPathnameStore() {
  if (typeof window === "undefined" || popstateInstalled) return;
  popstateInstalled = true;
  window.addEventListener("popstate", onPopState);

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.pushState = function pushStatePatched(data, unused, url) {
    const result = originalPushState(data, unused, url);
    syncPathnameStoreFromLiveLocation("history-pushstate");
    return result;
  };
  window.history.replaceState = function replaceStatePatched(data, unused, url) {
    const result = originalReplaceState(data, unused, url);
    syncPathnameStoreFromLiveLocation("history-replacestate");
    return result;
  };
}

if (typeof window !== "undefined") {
  installMainTabInternalPathnameStore();
}
