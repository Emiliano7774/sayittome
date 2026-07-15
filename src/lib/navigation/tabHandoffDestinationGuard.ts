/**
 * Destination-scoped handoff guard tokens.
 * Prevents Boost/Chats ping-pong: previous-hop cleanup and exit-latch clears
 * cannot disarm another destination's in-flight post-reveal guard.
 */
import type { MainTabHref } from "@/lib/navigation/mainTabs";

export type HandoffGuardDestination = "/boost" | "/chats" | "/shuffle";

export type HandoffGuardToken = {
  txId: string;
  source: MainTabHref | string | null;
  destination: HandoffGuardDestination;
  routeTarget: HandoffGuardDestination;
  owner: HandoffGuardDestination;
  startedAt: number;
  routeCommittedAt: number | null;
  revealStartedAt: number | null;
  guardReadyAt: number | null;
  guardCompletedAt: number | null;
  releaseAllowedAt: number | null;
};

type TraceFn = (event: string, detail?: unknown) => void;

let traceImpl: TraceFn | null = null;
let txSeq = 0;

/** Active token by destination (at most one in-flight guard per destination). */
const activeByDestination = new Map<HandoffGuardDestination, HandoffGuardToken>();

/** Settle CSS refcount per destination dataset key. */
const settleRefByDestination = new Map<HandoffGuardDestination, number>();

export function registerHandoffGuardTrace(fn: TraceFn) {
  traceImpl = fn;
}

function trace(event: string, detail?: unknown) {
  try {
    traceImpl?.(event, detail);
  } catch {
    /* ignore */
  }
}

function isGuardDestination(tab: string): tab is HandoffGuardDestination {
  return tab === "/boost" || tab === "/chats" || tab === "/shuffle";
}

export function createHandoffGuardToken(
  source: MainTabHref | string | null,
  destination: HandoffGuardDestination,
): HandoffGuardToken {
  txSeq += 1;
  const token: HandoffGuardToken = {
    txId: `htx-${Date.now().toString(36)}-${txSeq}`,
    source,
    destination,
    routeTarget: destination,
    owner: destination,
    startedAt: Date.now(),
    routeCommittedAt: null,
    revealStartedAt: null,
    guardReadyAt: null,
    guardCompletedAt: null,
    releaseAllowedAt: null,
  };
  // Replace any prior in-flight token for this destination (new hop owns it).
  const prior = activeByDestination.get(destination);
  if (prior) {
    releaseSettleCssForToken(prior);
    activeByDestination.delete(destination);
    trace("TAB_HANDOFF_GUARD_TOKEN_CLEANED", {
      txId: prior.txId,
      destination,
      via: "replaced-by-new-token",
    });
  }
  activeByDestination.set(destination, token);
  holdSettleCssForToken(token);
  trace("TAB_HANDOFF_GUARD_TOKEN_CREATED", {
    txId: token.txId,
    source,
    destination,
  });
  return token;
}

export function getActiveHandoffGuardToken(
  destination: HandoffGuardDestination,
): HandoffGuardToken | null {
  return activeByDestination.get(destination) ?? null;
}

export function getActiveHandoffGuardTxId(
  destination: HandoffGuardDestination,
): string | null {
  return activeByDestination.get(destination)?.txId ?? null;
}

export function markHandoffGuardRouteCommitted(
  destination: HandoffGuardDestination,
  txId?: string | null,
) {
  const token = activeByDestination.get(destination);
  if (!token) return null;
  if (txId && token.txId !== txId) return null;
  token.routeCommittedAt = Date.now();
  trace("TAB_HANDOFF_GUARD_TOKEN_ROUTE_COMMITTED", {
    txId: token.txId,
    destination,
  });
  return token;
}

export function markHandoffGuardRevealStarted(
  destination: HandoffGuardDestination,
  txId?: string | null,
) {
  const token = activeByDestination.get(destination);
  if (!token) return null;
  if (txId && token.txId !== txId) return null;
  token.revealStartedAt = Date.now();
  trace("TAB_HANDOFF_GUARD_TOKEN_REVEAL_STARTED", {
    txId: token.txId,
    destination,
  });
  return token;
}

export function markHandoffGuardReady(
  destination: HandoffGuardDestination,
  txId?: string | null,
) {
  const token = activeByDestination.get(destination);
  if (!token) return null;
  if (txId && token.txId !== txId) return null;
  token.guardReadyAt = Date.now();
  token.releaseAllowedAt = token.guardReadyAt;
  trace("TAB_HANDOFF_GUARD_TOKEN_READY", {
    txId: token.txId,
    destination,
  });
  trace("TAB_HANDOFF_GUARD_TOKEN_RELEASE_ALLOWED", {
    txId: token.txId,
    destination,
  });
  return token;
}

export function completeHandoffGuardToken(
  destination: HandoffGuardDestination,
  txId?: string | null,
) {
  const token = activeByDestination.get(destination);
  if (!token) return false;
  if (txId && token.txId !== txId) {
    trace("TAB_HANDOFF_GUARD_TOKEN_CLEANUP_BLOCKED_STALE", {
      attemptedTxId: txId,
      activeTxId: token.txId,
      destination,
    });
    return false;
  }
  token.guardCompletedAt = Date.now();
  if (!token.releaseAllowedAt) token.releaseAllowedAt = token.guardCompletedAt;
  releaseSettleCssForToken(token);
  activeByDestination.delete(destination);
  trace("TAB_HANDOFF_GUARD_TOKEN_CLEANED", {
    txId: token.txId,
    destination,
  });
  trace("TAB_HANDOFF_CANONICAL_IDLE_AFTER_GUARD", {
    txId: token.txId,
    destination,
  });
  return true;
}

/**
 * Previous-hop cleanup may clear sibling trackers only when they are not the
 * active destination token owner.
 */
export function canClearDestinationGuardForPreviousHop(
  tabBeingCleared: string,
  nextDestination: string,
): boolean {
  if (!isGuardDestination(tabBeingCleared)) return true;
  const token = activeByDestination.get(tabBeingCleared);
  if (!token) return true;
  // Never clear the active destination's own in-flight guard.
  if (tabBeingCleared === nextDestination) {
    trace("TAB_HANDOFF_PREVIOUS_HOP_CLEANUP_IGNORED_FOR_ACTIVE_TOKEN", {
      tab: tabBeingCleared,
      destination: nextDestination,
      txId: token.txId,
      reason: "same-destination",
    });
    return false;
  }
  // Do not clear another destination that still has post-reveal in flight
  // if next hop is unrelated — allow clear of siblings when navigating away.
  // Block only when clearing would hit a token whose destination matches next
  // (defensive) or when caller tries to clear current destination.
  if (token.destination === nextDestination) {
    trace("TAB_HANDOFF_GUARD_TOKEN_CLEANUP_BLOCKED_OTHER_DESTINATION", {
      tab: tabBeingCleared,
      destination: nextDestination,
      txId: token.txId,
    });
    return false;
  }
  // Sibling previous hop: allowed to clear (old Boost when going to Chats, etc.)
  return true;
}

/**
 * Gate clearShuffleExitToMainTab: block if an in-flight destination guard has
 * not yet reached releaseAllowed, unless force or matching completed owner.
 */
export function canClearShuffleExitLatch(opts?: {
  txId?: string | null;
  destination?: string | null;
  force?: boolean;
}): { allowed: boolean; reason: string } {
  if (opts?.force) return { allowed: true, reason: "force" };

  const dest =
    opts?.destination && isGuardDestination(opts.destination)
      ? opts.destination
      : null;

  // If a specific destination claims ownership, only that token may clear after ready.
  if (dest) {
    const token = activeByDestination.get(dest);
    if (!token) return { allowed: true, reason: "no-active-token" };
    if (opts?.txId && opts.txId !== token.txId) {
      trace("TAB_HANDOFF_GUARD_TOKEN_CLEANUP_BLOCKED_STALE", {
        attemptedTxId: opts.txId,
        activeTxId: token.txId,
        destination: dest,
        via: "exit-latch",
      });
      return { allowed: false, reason: "stale-tx" };
    }
    if (!token.releaseAllowedAt) {
      trace("TAB_HANDOFF_PREVIOUS_HOP_CLEANUP_IGNORED_FOR_ACTIVE_TOKEN", {
        destination: dest,
        txId: token.txId,
        via: "exit-latch-before-guard-ready",
      });
      return { allowed: false, reason: "guard-not-ready" };
    }
    return { allowed: true, reason: "owner-ready" };
  }

  // Unscoped clear (ShuffleKeepAliveHost early presentation clears): allow only
  // when no Boost/Chats token is waiting for guard-ready. Presentation can still
  // clear when only shuffle token is active (shuffle uses short hold).
  for (const d of ["/boost", "/chats"] as const) {
    const token = activeByDestination.get(d);
    if (token && !token.releaseAllowedAt) {
      trace("TAB_HANDOFF_PREVIOUS_HOP_CLEANUP_IGNORED_FOR_ACTIVE_TOKEN", {
        destination: d,
        txId: token.txId,
        via: "unscoped-exit-latch-clear",
      });
      return { allowed: false, reason: `active-${d}-guard` };
    }
  }
  return { allowed: true, reason: "no-blocking-token" };
}

function holdSettleCssForToken(token: HandoffGuardToken) {
  const n = (settleRefByDestination.get(token.destination) ?? 0) + 1;
  settleRefByDestination.set(token.destination, n);
  syncSettleDatasetsFromRefcount();
  trace("TAB_HANDOFF_SETTLE_CSS_REF_HELD", {
    txId: token.txId,
    destination: token.destination,
    ref: n,
  });
}

function releaseSettleCssForToken(token: HandoffGuardToken) {
  const n = Math.max(0, (settleRefByDestination.get(token.destination) ?? 0) - 1);
  if (n === 0) settleRefByDestination.delete(token.destination);
  else settleRefByDestination.set(token.destination, n);
  syncSettleDatasetsFromRefcount();
  trace("TAB_HANDOFF_SETTLE_CSS_REF_RELEASED", {
    txId: token.txId,
    destination: token.destination,
    ref: n,
  });
}

function settleDatasetAttr(destination: HandoffGuardDestination): string {
  if (destination === "/boost") return "boostPostCommitSettle";
  if (destination === "/chats") return "chatsPostAuthSettle";
  return "shufflePostAuthSettle";
}

/**
 * Merge token refcounts with live postAuth trackers (caller may also set
 * datasets). Ensures aggregate tabPostAuthSettle stays while any ref > 0.
 */
export function syncSettleDatasetsFromRefcount(
  extraActive?: Iterable<HandoffGuardDestination>,
) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const active = new Set<HandoffGuardDestination>();
  for (const [dest, ref] of settleRefByDestination) {
    if (ref > 0) active.add(dest);
  }
  if (extraActive) {
    for (const d of extraActive) active.add(d);
  }
  for (const dest of ["/boost", "/chats", "/shuffle"] as const) {
    const key = settleDatasetAttr(dest);
    if (active.has(dest)) html.dataset[key] = "1";
    // Do not delete here if trackers still active — tabDestinationReadiness
    // sync owns final delete when both tracker and ref are idle.
  }
  if (active.size > 0) html.dataset.tabPostAuthSettle = "1";
}

export function isDestinationSettleRefHeld(
  destination: HandoffGuardDestination,
): boolean {
  return (settleRefByDestination.get(destination) ?? 0) > 0;
}

export function isAnyAuthDestinationGuardActive(): boolean {
  return (
    activeByDestination.has("/boost") || activeByDestination.has("/chats")
  );
}

/** Test/harness helpers */
export function __resetHandoffGuardStoreForTests() {
  activeByDestination.clear();
  settleRefByDestination.clear();
  txSeq = 0;
}

export function __exportHandoffGuardStoreForTests() {
  return {
    active: [...activeByDestination.entries()].map(([d, t]) => ({
      destination: d,
      txId: t.txId,
      releaseAllowedAt: t.releaseAllowedAt,
      guardCompletedAt: t.guardCompletedAt,
    })),
    settleRefs: Object.fromEntries(settleRefByDestination),
  };
}
