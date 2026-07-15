/**
 * Internal Boost handoff suppress window (settle + short post-guard grace).
 * Direct cold /boost never arms this — only handoff begin/scheduleClear paths.
 * Suppress is tx-scoped so a stale Boost arm cannot outlive its handoff token.
 *
 * Session-persisted so SoftNavigate context-destroy remounts (Shuffle→Boost,
 * especially after a prior Chats hop) rehydrate suppress + CSS datasets before
 * BoostAccessGate can paint "Cargando...".
 *
 * Pre-paint: writeBoostPrepaintHandoffMarker (pointerdown / exit begin) + inline
 * head bootstrap install DOM attrs before React effects; this module then takes
 * over and clears the prepaint marker after React suppress is live.
 *
 * Destination-scoped: Chats prepaint cleanup never clears Boost keys/tx.
 */

import {
  BOOST_PREPAINT_TTL_MS,
  clearBoostPrepaintHandoffMarker,
  installBoostPrepaintSuppressDom,
  isBoostPrepaintHandoffActive,
  isRealInternalBoostHandoffSource,
  rehydrateBoostPrepaintFromSession,
  writeBoostPrepaintHandoffMarker,
} from "@/lib/boost/boostPrepaintHandoff";

const SESSION_UNTIL_KEY = "sayittome:boost-sequence-handoff-suppress-until";
const SESSION_TX_KEY = "sayittome:boost-sequence-handoff-suppress-tx";

function prepaintTtlFromArmMs(ms: number) {
  return Math.min(BOOST_PREPAINT_TTL_MS, Math.max(ms + 400, 1200));
}

let boostSequenceHandoffSuppressUntil = 0;
let boostSequenceHandoffSuppressTxId: string | null = null;

function syncBoostHandoffSuppressDataset() {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (Date.now() < boostSequenceHandoffSuppressUntil) {
    html.dataset.boostHandoffSuppress = "1";
    html.dataset.boostPostCommitSettle = "1";
    html.dataset.tabPostAuthSettle = "1";
  } else if (!isBoostPrepaintHandoffActive()) {
    delete html.dataset.boostHandoffSuppress;
  }
}

function persistBoostHandoffSuppressSession() {
  if (typeof window === "undefined") return;
  try {
    if (Date.now() >= boostSequenceHandoffSuppressUntil) {
      window.sessionStorage.removeItem(SESSION_UNTIL_KEY);
      window.sessionStorage.removeItem(SESSION_TX_KEY);
      return;
    }
    window.sessionStorage.setItem(
      SESSION_UNTIL_KEY,
      String(boostSequenceHandoffSuppressUntil),
    );
    if (boostSequenceHandoffSuppressTxId) {
      window.sessionStorage.setItem(SESSION_TX_KEY, boostSequenceHandoffSuppressTxId);
    } else {
      window.sessionStorage.removeItem(SESSION_TX_KEY);
    }
  } catch {
    /* ignore */
  }
}

function hydrateBoostHandoffSuppressFromSession() {
  if (typeof window === "undefined") return false;
  const prepaint = rehydrateBoostPrepaintFromSession();
  try {
    const untilRaw = window.sessionStorage.getItem(SESSION_UNTIL_KEY);
    const until = untilRaw ? Number(untilRaw) : 0;
    if (!Number.isFinite(until) || until <= Date.now()) {
      if (!prepaint) {
        window.sessionStorage.removeItem(SESSION_UNTIL_KEY);
        window.sessionStorage.removeItem(SESSION_TX_KEY);
      }
      return prepaint;
    }
    boostSequenceHandoffSuppressUntil = Math.max(
      boostSequenceHandoffSuppressUntil,
      until,
    );
    boostSequenceHandoffSuppressTxId =
      window.sessionStorage.getItem(SESSION_TX_KEY) ||
      boostSequenceHandoffSuppressTxId;
    syncBoostHandoffSuppressDataset();
    try {
      document.documentElement.dataset.boostHandoffSuppressRehydrated = "1";
    } catch {
      /* ignore */
    }
    if (prepaint) {
      try {
        (
          window as Window & {
            __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
          }
        ).__sayittomePrepaintDiag = (
          (
            window as Window & {
              __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
            }
          ).__sayittomePrepaintDiag || []
        ).concat([
          {
            t: Date.now(),
            event: "TAB_HANDOFF_BOOST_PREPAINT_TO_REACT_SUPPRESS_HANDOFF",
          },
        ]);
      } catch {
        /* ignore */
      }
    }
    return true;
  } catch {
    return prepaint;
  }
}

if (typeof window !== "undefined") {
  hydrateBoostHandoffSuppressFromSession();
}

/** Arm / extend internal Boost handoff suppress (settle + post-guard grace). */
export function armBoostSequenceHandoffSuppress(
  ms = 480,
  opts?: { txId?: string | null; from?: string | null },
) {
  hydrateBoostHandoffSuppressFromSession();
  const until = Date.now() + Math.max(0, ms);
  const txId = opts?.txId ?? null;
  // Newer or same tx may extend; different older tx without id may still extend
  // for backward-compat paths that omit txId during the same Boost handoff.
  if (txId) {
    boostSequenceHandoffSuppressTxId = txId;
  }
  if (until > boostSequenceHandoffSuppressUntil) {
    boostSequenceHandoffSuppressUntil = until;
  }
  // Keep prepaint marker alive across the arm window when from is a real
  // internal handoff source. Never invent "/shuffle" here — callers must pass
  // a real from, or omit it (extend suppress without rewriting marker).
  if (opts?.from && isRealInternalBoostHandoffSource(opts.from)) {
    writeBoostPrepaintHandoffMarker({
      from: opts.from,
      txId,
      ttlMs: prepaintTtlFromArmMs(ms),
    });
  } else if (isBoostPrepaintHandoffActive()) {
    installBoostPrepaintSuppressDom({ via: "arm-suppress", fromMarker: true });
  }
  persistBoostHandoffSuppressSession();
  syncBoostHandoffSuppressDataset();
  try {
    (
      window as Window & {
        __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
      }
    ).__sayittomePrepaintDiag = (
      (
        window as Window & {
          __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
        }
      ).__sayittomePrepaintDiag || []
    ).concat([
      {
        t: Date.now(),
        event: "TAB_HANDOFF_BOOST_LOADING_BLOCKED_DURING_INTERNAL_HANDOFF",
        txId,
        until: boostSequenceHandoffSuppressUntil,
      },
    ]);
  } catch {
    /* ignore */
  }
}

export function isBoostSequenceHandoffSuppressActive(opts?: {
  txId?: string | null;
}) {
  hydrateBoostHandoffSuppressFromSession();
  if (Date.now() >= boostSequenceHandoffSuppressUntil) {
    persistBoostHandoffSuppressSession();
    // Prepaint may still cover the first-paint window after until expiry race.
    if (isBoostPrepaintHandoffActive()) {
      syncBoostHandoffSuppressDataset();
      return true;
    }
    return false;
  }
  if (
    opts?.txId &&
    boostSequenceHandoffSuppressTxId &&
    opts.txId !== boostSequenceHandoffSuppressTxId
  ) {
    return false;
  }
  syncBoostHandoffSuppressDataset();
  return true;
}

export function clearBoostSequenceHandoffSuppress(opts?: {
  txId?: string | null;
  force?: boolean;
}) {
  if (
    !opts?.force &&
    opts?.txId &&
    boostSequenceHandoffSuppressTxId &&
    opts.txId !== boostSequenceHandoffSuppressTxId
  ) {
    return false;
  }
  boostSequenceHandoffSuppressUntil = 0;
  boostSequenceHandoffSuppressTxId = null;
  persistBoostHandoffSuppressSession();
  clearBoostPrepaintHandoffMarker({
    force: true,
    reason: opts?.force ? "force-clear-suppress" : "clear-suppress",
  });
  if (typeof document !== "undefined") {
    delete document.documentElement.dataset.boostHandoffSuppress;
    delete document.documentElement.dataset.boostHandoffSuppressRehydrated;
  }
  try {
    (
      window as Window & {
        __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
      }
    ).__sayittomePrepaintDiag = (
      (
        window as Window & {
          __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
        }
      ).__sayittomePrepaintDiag || []
    ).concat([
      {
        t: Date.now(),
        event: "TAB_HANDOFF_BOOST_SUPPRESS_CLEARED_AFTER_CANONICAL_IDLE",
        force: opts?.force === true,
      },
    ]);
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * After React suppress is live and loading is stable-false, drop the prepaint
 * dataset so only the canonical suppress token owns CSS. Marker session key
 * may already be TTL-expired. Does not clear Chats prepaint.
 */
export function handoffBoostPrepaintToReactSuppress(detail?: { reason?: string }) {
  if (!isBoostSequenceHandoffSuppressActive()) return false;
  syncBoostHandoffSuppressDataset();
  clearBoostPrepaintHandoffMarker({
    reason: detail?.reason ?? "react-suppress-takeover",
  });
  syncBoostHandoffSuppressDataset();
  try {
    (
      window as Window & {
        __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
      }
    ).__sayittomePrepaintDiag = (
      (
        window as Window & {
          __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
        }
      ).__sayittomePrepaintDiag || []
    ).concat([
      {
        t: Date.now(),
        event: "TAB_HANDOFF_BOOST_PREPAINT_TO_REACT_SUPPRESS_HANDOFF",
        reason: detail?.reason ?? "react-suppress-takeover",
      },
    ]);
  } catch {
    /* ignore */
  }
  return true;
}

export function getBoostSequenceHandoffSuppressTxId() {
  hydrateBoostHandoffSuppressFromSession();
  return boostSequenceHandoffSuppressTxId;
}

/** True when suppress was restored from session after a remount / module reinit. */
export function wasBoostHandoffSuppressRehydratedFromSession() {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.boostHandoffSuppressRehydrated === "1";
}

export {
  writeBoostPrepaintHandoffMarker,
  isBoostPrepaintHandoffActive,
  clearBoostPrepaintHandoffMarker,
  rehydrateBoostPrepaintFromSession,
} from "@/lib/boost/boostPrepaintHandoff";
