/**
 * History back/forward restore guard for main-tab → Shuffle micro-slide.
 * Popstate must restore pathname/nav UI only — never begin a micro-slide tx/pin.
 */

const RESTORE_WINDOW_MS = 500;

let restoreUntilMono = 0;
let restoreGeneration = 0;

function monoMs() {
  if (typeof performance === "undefined") return Date.now();
  return Math.round(performance.timeOrigin + performance.now());
}

export type MicroSlideNavTriggerType =
  | "user-main-tab-pointerdown"
  | "user-main-tab-click"
  | "pointerenter-warm"
  | "programmatic"
  | "popstate-restore"
  | "unknown";

let lastClickIntent: {
  intentId: string;
  triggerType: MicroSlideNavTriggerType;
  sourcePath: string;
  createdMono: number;
  expiresAtMono: number;
} | null = null;

type NavDiagKind =
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

function emitNavIntentDiag(
  kind: NavDiagKind,
  extras: {
    href: string;
    reason: string;
    caller: string;
    prevPathname?: string | null;
    nextPathname?: string | null;
    transactionIdOverride?: string | null;
  },
) {
  // Lazy import avoids circular dep: transition ↔ commitNavigation ↔ intent.
  void import("@/lib/navigation/mainTabShuffleCommitNavigation").then(({ emitMicroSlideCommitNavDiag }) => {
    emitMicroSlideCommitNavDiag(kind, {
      href: extras.href,
      reason: extras.reason,
      forcedSoft: false,
      caller: extras.caller,
      prevPathname: extras.prevPathname ?? null,
      nextPathname: extras.nextPathname ?? null,
      transactionIdOverride: extras.transactionIdOverride ?? null,
      commitMode: "history",
    });
  });
}

export function markHistoryPopstateRestoreInProgress(extras?: {
  pathname?: string;
  prevPathname?: string | null;
}) {
  const now = monoMs();
  restoreGeneration += 1;
  restoreUntilMono = now + RESTORE_WINDOW_MS;
  // Expire any click intent so popstate cannot consume a prior gesture.
  lastClickIntent = null;
  emitNavIntentDiag("HISTORY_POPSTATE_RESTORE_PATHNAME_ONLY", {
    href: extras?.pathname ?? "/",
    reason: "popstate-restore",
    caller: "markHistoryPopstateRestoreInProgress",
    prevPathname: extras?.prevPathname ?? null,
    nextPathname: extras?.pathname ?? null,
  });
  emitNavIntentDiag("HISTORY_BACK_FORWARD_RESTORE_NO_MICRO_SLIDE", {
    href: extras?.pathname ?? "/",
    reason: "popstate-restore-no-micro-slide",
    caller: "markHistoryPopstateRestoreInProgress",
    prevPathname: extras?.prevPathname ?? null,
    nextPathname: extras?.pathname ?? null,
  });
  return restoreGeneration;
}

export function isHistoryPopstateRestoreInProgress(now = monoMs()) {
  return now < restoreUntilMono;
}

export function clearHistoryPopstateRestoreGuard() {
  restoreUntilMono = 0;
}

export function armMicroSlideUserClickIntent(
  sourcePath: string,
  triggerType: MicroSlideNavTriggerType = "user-main-tab-pointerdown",
) {
  if (isHistoryPopstateRestoreInProgress()) {
    emitNavIntentDiag("MICRO_SLIDE_NAV_INTENT_EXPIRED", {
      href: "/shuffle",
      reason: "blocked-by-popstate-restore",
      caller: "armMicroSlideUserClickIntent",
    });
    return null;
  }
  const now = monoMs();
  const intentId = `intent-${now}-${Math.random().toString(36).slice(2, 8)}`;
  lastClickIntent = {
    intentId,
    triggerType,
    sourcePath,
    createdMono: now,
    expiresAtMono: now + 2500,
  };
  emitNavIntentDiag("MICRO_SLIDE_NAV_INTENT_CREATED", {
    href: "/shuffle",
    reason: triggerType,
    caller: "armMicroSlideUserClickIntent",
    transactionIdOverride: intentId,
  });
  return lastClickIntent;
}

export function consumeMicroSlideUserClickIntent(sourcePath?: string) {
  const intent = lastClickIntent;
  const now = monoMs();
  if (!intent) return null;
  if (now > intent.expiresAtMono) {
    lastClickIntent = null;
    emitNavIntentDiag("MICRO_SLIDE_NAV_INTENT_EXPIRED", {
      href: "/shuffle",
      reason: "ttl",
      caller: "consumeMicroSlideUserClickIntent",
    });
    return null;
  }
  if (sourcePath && intent.sourcePath !== sourcePath) {
    return null;
  }
  lastClickIntent = null;
  emitNavIntentDiag("MICRO_SLIDE_NAV_INTENT_CONSUMED", {
    href: "/shuffle",
    reason: intent.triggerType,
    caller: "consumeMicroSlideUserClickIntent",
    transactionIdOverride: intent.intentId,
  });
  return intent;
}

export function peekMicroSlideUserClickIntent() {
  const now = monoMs();
  if (!lastClickIntent) return null;
  if (now > lastClickIntent.expiresAtMono) {
    lastClickIntent = null;
    return null;
  }
  return lastClickIntent;
}

export function canBeginMicroSlideFromWarmTrigger(triggerType: MicroSlideNavTriggerType) {
  if (isHistoryPopstateRestoreInProgress()) return false;
  if (triggerType === "pointerenter-warm" || triggerType === "popstate-restore") return false;
  if (triggerType === "user-main-tab-pointerdown" || triggerType === "user-main-tab-click") {
    return true;
  }
  // Programmatic/unknown: only if a live click intent exists.
  return peekMicroSlideUserClickIntent() != null;
}

export function reportMicroSlideTransitionBeginBlocked(triggerType: MicroSlideNavTriggerType, caller: string) {
  emitNavIntentDiag("MICRO_SLIDE_TRANSITION_BEGIN_BLOCKED_POPSTATE", {
    href: "/shuffle",
    reason: `begin-blocked:${triggerType}`,
    caller,
  });
  emitNavIntentDiag("MICRO_SLIDE_TRANSITION_BEGIN_BLOCKED_NO_ACTIVE_TX", {
    href: "/shuffle",
    reason: "restore-or-missing-intent",
    caller,
  });
}

export function reportMicroSlideTransitionBeginAllowed(
  triggerType: MicroSlideNavTriggerType,
  extras: { txId: string; caller: string },
) {
  emitNavIntentDiag("MICRO_SLIDE_TRANSITION_BEGIN_ALLOWED_BY_INTENT", {
    href: "/shuffle",
    reason: triggerType,
    caller: extras.caller,
    transactionIdOverride: extras.txId,
  });
}

export function reportMicroSlidePinCreationBlocked(caller: string, reason = "no-active-tx") {
  emitNavIntentDiag("MICRO_SLIDE_PIN_CREATION_BLOCKED_NO_ACTIVE_TX", {
    href: "/shuffle",
    reason,
    caller,
  });
}

export function reportStalePinClearedNoTx(txId: string | null, caller: string, reason: string) {
  emitNavIntentDiag("MICRO_SLIDE_STALE_PIN_CLEARED_NO_TX", {
    href: "/shuffle",
    reason,
    caller,
    transactionIdOverride: txId,
  });
}

/** Test-only reset. */
export function resetMicroSlideNavIntentForTests() {
  restoreUntilMono = 0;
  restoreGeneration = 0;
  lastClickIntent = null;
}
