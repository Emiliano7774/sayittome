"use client";

/**
 * Narrow, auditable same-document override for the main-tab -> Shuffle micro-slide commit.
 *
 * Native shell: prefer history.pushState (mode "history") to avoid Next router.push realm wipe.
 * Web / non-native: keep soft router.push (mode "soft").
 * Outside micro-slide: hardNavigate unchanged.
 */

import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  shouldHardNavigate,
  shouldHardNavigatePath,
} from "@/lib/navigation/hardNavigate";
import { getMainTabShufflePresentationRuntimeInstanceId } from "@/lib/navigation/mainTabShufflePresentationRuntime";
import {
  getMainTabToShuffleTransaction,
  getTransitionModuleInstanceIdForDiag,
  type MainTabToShufflePhase,
} from "@/lib/navigation/mainTabToShuffleTransition";
import { isMainTabToShuffleMicroSlideEnabled } from "@/lib/perf/instantaneityFlags";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";

/** Soft router.push capability for web / non-native micro-slide commits. */
export const MICRO_SLIDE_FORCE_SOFT_NAV_FOR_SHUFFLE_COMMIT = true;

/** History pushState capability for native-shell micro-slide commits (wipe prevention). */
export const MICRO_SLIDE_FORCE_HISTORY_NAV_FOR_NATIVE_SHELL_COMMIT = true;

export type CommitNavigationMode = "soft" | "history" | "hard" | "unknown";

/** Phases in which a live micro-slide transaction owns the /shuffle commit. */
const COMMIT_ACTIVE_PHASES: readonly MainTabToShufflePhase[] = [
  "preparing",
  "armed",
  "sliding",
  "settled",
  "route_bridge",
];

function normalizePath(href: string) {
  return String(href || "/").split("?")[0].split("#")[0] || "/";
}

/**
 * True only when a live micro-slide transaction to /shuffle is active for this commit.
 */
export function isMicroSlideCommitActiveForShuffle(href: string): boolean {
  if (!isMainTabToShuffleMicroSlideEnabled()) return false;
  if (normalizePath(href) !== "/shuffle") return false;
  const tx = getMainTabToShuffleTransaction();
  if (!tx || tx.destination !== "shuffle") return false;
  return COMMIT_ACTIVE_PHASES.includes(tx.phase);
}

export type CommitNavigationModeReport = {
  href: string;
  destination: string;
  nativeShellHardNavWouldNormallyApply: boolean;
  microSlideEnabled: boolean;
  microSlideSoftOverrideApplies: boolean;
  microSlideHistoryOverrideApplies: boolean;
  microSlideCommitOverrideApplies: boolean;
  softNavigationToShuffleAvailable: boolean;
  historyNavigationToShuffleAvailable: boolean;
  allowedCommitModeForMicroSlide: "soft" | "history" | null;
  effectiveCommitNavigationMode: CommitNavigationMode;
  reason: string;
};

/**
 * Pure decision — mirrored by scripts/main-tab-shuffle-commit-nav-mode.mjs.
 */
export function computeMainTabToShuffleCommitNavigationMode(input: {
  href: string;
  microSlideEnabled: boolean;
  softOverrideCapable: boolean;
  historyOverrideCapable?: boolean;
  nativeShellHardNavWouldApply: boolean;
  contextKnown?: boolean;
}): CommitNavigationModeReport {
  const href = normalizePath(input.href);
  const contextKnown = input.contextKnown !== false;
  const historyCapable = input.historyOverrideCapable !== false;
  const softCapable = input.softOverrideCapable === true;

  const microSlideHistoryOverrideApplies =
    historyCapable === true &&
    input.microSlideEnabled === true &&
    href === "/shuffle" &&
    input.nativeShellHardNavWouldApply === true;

  const microSlideSoftOverrideApplies =
    softCapable === true &&
    input.microSlideEnabled === true &&
    href === "/shuffle" &&
    !microSlideHistoryOverrideApplies;

  const microSlideCommitOverrideApplies =
    microSlideHistoryOverrideApplies || microSlideSoftOverrideApplies;

  let effectiveCommitNavigationMode: CommitNavigationMode;
  let reason: string;
  let allowedCommitModeForMicroSlide: "soft" | "history" | null = null;

  if (!contextKnown) {
    effectiveCommitNavigationMode = "unknown";
    reason = "context-unknown";
  } else if (microSlideHistoryOverrideApplies) {
    effectiveCommitNavigationMode = "history";
    reason = "micro-slide-history-override-native-shell";
    allowedCommitModeForMicroSlide = "history";
  } else if (microSlideSoftOverrideApplies) {
    effectiveCommitNavigationMode = "soft";
    reason = input.nativeShellHardNavWouldApply
      ? "micro-slide-soft-override-native-shell-fallback"
      : "micro-slide-soft-override";
    allowedCommitModeForMicroSlide = "soft";
  } else if (input.nativeShellHardNavWouldApply === true) {
    effectiveCommitNavigationMode = "hard";
    reason = "native-shell-hard-nav";
  } else {
    effectiveCommitNavigationMode = "soft";
    reason = "default-router-push";
  }

  const softNavigationToShuffleAvailable = effectiveCommitNavigationMode === "soft";
  const historyNavigationToShuffleAvailable = effectiveCommitNavigationMode === "history";

  return {
    href,
    destination: href,
    nativeShellHardNavWouldNormallyApply: input.nativeShellHardNavWouldApply === true,
    microSlideEnabled: input.microSlideEnabled === true,
    microSlideSoftOverrideApplies,
    microSlideHistoryOverrideApplies,
    microSlideCommitOverrideApplies,
    softNavigationToShuffleAvailable,
    historyNavigationToShuffleAvailable,
    allowedCommitModeForMicroSlide,
    effectiveCommitNavigationMode,
    reason,
  };
}

export function getMainTabToShuffleCommitNavigationMode(
  href = "/shuffle",
): CommitNavigationModeReport {
  if (typeof window === "undefined") {
    return computeMainTabToShuffleCommitNavigationMode({
      href,
      microSlideEnabled: false,
      softOverrideCapable: MICRO_SLIDE_FORCE_SOFT_NAV_FOR_SHUFFLE_COMMIT,
      historyOverrideCapable: MICRO_SLIDE_FORCE_HISTORY_NAV_FOR_NATIVE_SHELL_COMMIT,
      nativeShellHardNavWouldApply: false,
      contextKnown: false,
    });
  }
  const nativeShellHardNavWouldApply =
    shouldHardNavigate() && shouldHardNavigatePath(href);
  return computeMainTabToShuffleCommitNavigationMode({
    href,
    microSlideEnabled: isMainTabToShuffleMicroSlideEnabled(),
    softOverrideCapable: MICRO_SLIDE_FORCE_SOFT_NAV_FOR_SHUFFLE_COMMIT,
    historyOverrideCapable: MICRO_SLIDE_FORCE_HISTORY_NAV_FOR_NATIVE_SHELL_COMMIT,
    nativeShellHardNavWouldApply,
    contextKnown: true,
  });
}

export type MicroSlideCommitNavDiagKind =
  | "MICRO_SLIDE_SOFT_NAVIGATION_REQUIRED"
  | "MICRO_SLIDE_HARD_NAVIGATION_BYPASSED"
  | "MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED"
  | "MICRO_SLIDE_HISTORY_NAVIGATION_REQUIRED"
  | "MICRO_SLIDE_HISTORY_PUSHSTATE_CALLED"
  | "MICRO_SLIDE_HISTORY_URL_COMMITTED"
  | "MICRO_SLIDE_HISTORY_COMMIT_BLOCKED"
  | "MICRO_SLIDE_HISTORY_POPSTATE_BRIDGE_READY"
  | "MICRO_SLIDE_HISTORY_NAVIGATION_FAILED"
  | "MAIN_TAB_HISTORY_PATHNAME_STORE_UPDATED"
  | "MAIN_TAB_HISTORY_PATHNAME_STORE_POPSTATE"
  | "MAIN_TAB_HISTORY_PATHNAME_STORE_RESET"
  | "HISTORY_POPSTATE_RESTORE_PATHNAME_ONLY"
  | "HISTORY_BACK_FORWARD_RESTORE_NO_MICRO_SLIDE"
  | "MICRO_SLIDE_NAV_INTENT_CREATED"
  | "MICRO_SLIDE_NAV_INTENT_CONSUMED"
  | "MICRO_SLIDE_NAV_INTENT_EXPIRED"
  | "MICRO_SLIDE_TRANSITION_BEGIN_ALLOWED_BY_INTENT"
  | "MICRO_SLIDE_TRANSITION_BEGIN_BLOCKED_POPSTATE"
  | "MICRO_SLIDE_TRANSITION_BEGIN_BLOCKED_NO_ACTIVE_TX"
  | "MICRO_SLIDE_PIN_CREATION_BLOCKED_NO_ACTIVE_TX"
  | "MICRO_SLIDE_STALE_PIN_CLEARED_NO_TX"
  | "HISTORY_BACK_FORWARD_PIN_GUARD_PASS"
  | "HISTORY_BACK_FORWARD_PIN_GUARD_FAIL";

export type MicroSlideCommitNavDiagEvent = {
  monoMs: number;
  kind: MicroSlideCommitNavDiagKind;
  href: string;
  reason: string;
  sourceTab: string | null;
  destination: string;
  transactionId: string | null;
  phase: MainTabToShufflePhase | "idle";
  isNativeAppShell: boolean;
  shouldHardNavigate: boolean;
  shouldHardNavigatePath: boolean;
  forcedSoft: boolean;
  forcedHistory?: boolean;
  caller: string;
  moduleInstanceId: string | null;
  runtimeInstanceId: string | null;
  prevPathname?: string | null;
  nextPathname?: string | null;
  historyLengthBefore?: number | null;
  historyLengthAfter?: number | null;
  stateKey?: string | null;
  commitMode?: CommitNavigationMode | null;
  navSeq?: number | null;
};

const DIAG_RING_MAX = 120;
const DIAG_RING_KEY = "__microSlideCommitNavDiag";
const DIAG_RING_STORAGE_KEY = "sayittome:micro-slide-commit-nav-diag";

let diagRing: MicroSlideCommitNavDiagEvent[] = [];

function monoMs() {
  if (typeof performance === "undefined") return 0;
  return Math.round(performance.timeOrigin + performance.now());
}

function restoreDiagRingFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(DIAG_RING_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      diagRing = parsed.slice(-DIAG_RING_MAX) as MicroSlideCommitNavDiagEvent[];
    }
  } catch {
    /* ignore */
  }
}

function persistDiagRing() {
  if (typeof window === "undefined") return;
  const win = window as unknown as Record<string, unknown>;
  win[DIAG_RING_KEY] = diagRing;
  try {
    window.sessionStorage.setItem(DIAG_RING_STORAGE_KEY, JSON.stringify(diagRing));
  } catch {
    /* ignore */
  }
}

export function emitMicroSlideCommitNavDiag(
  kind: MicroSlideCommitNavDiagKind,
  extras: {
    href: string;
    reason: string;
    forcedSoft: boolean;
    caller: string;
    forcedHistory?: boolean;
    prevPathname?: string | null;
    nextPathname?: string | null;
    historyLengthBefore?: number | null;
    historyLengthAfter?: number | null;
    stateKey?: string | null;
    commitMode?: CommitNavigationMode | null;
    transactionIdOverride?: string | null;
    navSeq?: number | null;
  },
): MicroSlideCommitNavDiagEvent {
  const hasWindow = typeof window !== "undefined";
  const tx = hasWindow ? getMainTabToShuffleTransaction() : null;
  const href = normalizePath(extras.href);
  const event: MicroSlideCommitNavDiagEvent = {
    monoMs: monoMs(),
    kind,
    href,
    reason: extras.reason,
    sourceTab: tx?.source ?? null,
    destination: href,
    transactionId: extras.transactionIdOverride ?? tx?.transactionId ?? null,
    phase: tx?.phase ?? "idle",
    isNativeAppShell: hasWindow ? isNativeAppShell() : false,
    shouldHardNavigate: hasWindow ? shouldHardNavigate() : false,
    shouldHardNavigatePath: hasWindow ? shouldHardNavigatePath(href) : false,
    forcedSoft: extras.forcedSoft,
    forcedHistory: extras.forcedHistory === true,
    caller: extras.caller,
    moduleInstanceId: getTransitionModuleInstanceIdForDiag(),
    runtimeInstanceId: hasWindow ? getMainTabShufflePresentationRuntimeInstanceId() : null,
    prevPathname: extras.prevPathname ?? null,
    nextPathname: extras.nextPathname ?? null,
    historyLengthBefore: extras.historyLengthBefore ?? null,
    historyLengthAfter: extras.historyLengthAfter ?? null,
    stateKey: extras.stateKey ?? null,
    commitMode: extras.commitMode ?? null,
    navSeq: extras.navSeq ?? tx?.navSeq ?? null,
  };
  diagRing = [...diagRing.slice(-DIAG_RING_MAX + 1), event];
  persistDiagRing();
  if (isNavTraceEnabled()) {
    console.info(`[micro-slide-commit-nav] ${kind}`, event);
  }
  return event;
}

export function exportMicroSlideCommitNavDiag(): MicroSlideCommitNavDiagEvent[] {
  return [...diagRing];
}

/** Browser diagnostic hook for capture runners. */
export function installMainTabShuffleCommitNavDiagHooks() {
  if (typeof window === "undefined") return;
  restoreDiagRingFromStorage();
  const win = window as unknown as Record<string, unknown>;
  win[DIAG_RING_KEY] = diagRing;
  win.__exportMicroSlideCommitNavDiag = exportMicroSlideCommitNavDiag;
  win.__getMainTabToShuffleCommitNavigationMode = getMainTabToShuffleCommitNavigationMode;
}

if (typeof window !== "undefined") {
  installMainTabShuffleCommitNavDiagHooks();
}
