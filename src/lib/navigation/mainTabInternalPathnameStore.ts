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

/** Effective pathname for main-tab presentation: override if set, else location/Next. */
export function getCurrentMainTabPathname(fallback?: string | null) {
  if (overridePathname) return overridePathname;
  if (fallback) return normalizePath(fallback);
  return locationPathname();
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

export function installMainTabInternalPathnameStore() {
  if (typeof window === "undefined" || popstateInstalled) return;
  popstateInstalled = true;
  window.addEventListener("popstate", onPopState);
}

if (typeof window !== "undefined") {
  installMainTabInternalPathnameStore();
}
