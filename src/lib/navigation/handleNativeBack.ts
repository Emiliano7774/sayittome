import {
  getNativeBackDestination,
  isNativeRootRoute,
  resolveNativeBack,
  stripNativeChatFullscreen,
} from "@/lib/navigation/nativeBack";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";

export type NativeBackNavigation = {
  navigateTo?: string;
  hintKey?: string;
  exitApp?: boolean;
};

let backLockUntil = 0;
let backLockPath = "";
/** When true, same-path dedupe holds until pathname leaves `backLockPath` (async router.replace). */
let backLockHoldUntilNavigation = false;
let pendingExitUntil = 0;

const BACK_LOCK_MS = 120;
const EXIT_CONFIRM_MS = 2000;

let backLockMsOverride: number | null = null;

export function setBackLockMsOverride(ms: number | null) {
  backLockMsOverride = ms;
}

function effectiveBackLockMs() {
  return backLockMsOverride ?? BACK_LOCK_MS;
}

function armBackLock(pathname: string, now: number, holdUntilNavigation = false) {
  backLockUntil = now + effectiveBackLockMs();
  backLockPath = pathname;
  backLockHoldUntilNavigation = holdUntilNavigation;
}

/** Call when the active pathname changes so navigation dedupe can release after async replace. */
export function notifyNativePathnameChanged(pathname: string) {
  const next = pathname.split("?")[0].split("#")[0] || "/";
  if (backLockHoldUntilNavigation && next !== backLockPath) {
    backLockUntil = 0;
    backLockHoldUntilNavigation = false;
  }
}

type BackLockProbeEntry = {
  at: number;
  gapMs?: number;
  pathnameBefore: string;
  pathnameAfter?: string;
  backLockPath?: string;
  outcome: "handled" | "discarded-lock" | "discarded-empty" | "navigate" | "hint" | "exit";
  reason?: string;
};

const backLockProbeLog: BackLockProbeEntry[] = [];

function recordBackProbe(entry: BackLockProbeEntry) {
  if (!isNavTraceEnabled()) return;
  backLockProbeLog.push(entry);
  if (backLockProbeLog.length > 200) backLockProbeLog.shift();
}

export function exportBackLockProbe() {
  return [...backLockProbeLog];
}

export function clearBackLockProbe() {
  backLockProbeLog.length = 0;
}

if (typeof window !== "undefined") {
  window.__sayittomeBackLockProbe = {
    export: exportBackLockProbe,
    clear: clearBackLockProbe,
    setLockMs: setBackLockMsOverride,
  };
}

declare global {
  interface Window {
    __sayittomeBackLockProbe?: {
      export: typeof exportBackLockProbe;
      clear: typeof clearBackLockProbe;
      setLockMs: typeof setBackLockMsOverride;
    };
  }
}

export function readNativePathname() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export function resetNativeBackExitTimer() {
  pendingExitUntil = 0;
}

export function resolveNativeBackNavigation(
  pathname = readNativePathname(),
): NativeBackNavigation | null {
  const now = Date.now();
  const awaitingExitConfirm = pendingExitUntil > now;

  if (
    !awaitingExitConfirm &&
    pathname === backLockPath &&
    (now < backLockUntil || backLockHoldUntilNavigation)
  ) {
    recordBackProbe({
      at: now,
      pathnameBefore: pathname,
      backLockPath,
      outcome: "discarded-lock",
      reason: backLockHoldUntilNavigation
        ? "same-path-dedupe-until-navigation"
        : `same-path-dedupe-${effectiveBackLockMs()}ms`,
    });
    return {};
  }

  const result = resolveNativeBack(pathname);

  if (result.handled) {
    if (result.dismissChatKeyboard) {
      return {};
    }

    if (result.navigateTo) {
      armBackLock(pathname, now, true);
      pendingExitUntil = 0;
      stripNativeChatFullscreen();
      recordBackProbe({
        at: now,
        pathnameBefore: pathname,
        pathnameAfter: result.navigateTo,
        backLockPath: pathname,
        outcome: "navigate",
      });
      return { navigateTo: result.navigateTo };
    }

    if (result.hintKey) {
      if (awaitingExitConfirm) {
        armBackLock(pathname, now);
        pendingExitUntil = 0;
        return { exitApp: true };
      }

      pendingExitUntil = now + EXIT_CONFIRM_MS;
      armBackLock(pathname, now);
      return { hintKey: result.hintKey };
    }

    armBackLock(pathname, now);
    pendingExitUntil = 0;
    return {};
  }

  const destination = getNativeBackDestination(pathname);
  if (destination && destination !== pathname) {
    armBackLock(pathname, now, true);
    pendingExitUntil = 0;
    stripNativeChatFullscreen();
    recordBackProbe({
      at: now,
      pathnameBefore: pathname,
      pathnameAfter: destination,
      backLockPath: pathname,
      outcome: "navigate",
    });
    return { navigateTo: destination };
  }

  if (isNativeRootRoute(pathname)) {
    if (awaitingExitConfirm) {
      armBackLock(pathname, now);
      pendingExitUntil = 0;
      recordBackProbe({ at: now, pathnameBefore: pathname, outcome: "exit" });
      return { exitApp: true };
    }

    pendingExitUntil = now + EXIT_CONFIRM_MS;
    armBackLock(pathname, now);
    recordBackProbe({ at: now, pathnameBefore: pathname, outcome: "hint", reason: "native_back_exit_hint" });
    return { hintKey: "native_back_exit_hint" };
  }

  return {};
}
