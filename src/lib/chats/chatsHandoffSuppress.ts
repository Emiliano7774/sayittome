/**
 * Internal Chats handoff suppress window (settle + short post-guard grace).
 * Direct cold /chats never arms this — only handoff begin/scheduleClear paths.
 * Suppress is tx-scoped so a stale Chats arm cannot outlive its handoff token.
 *
 * Session-persisted so SoftNavigate context-destroy remounts (Shuffle→Chats)
 * rehydrate suppress + CSS datasets before the inbox skeleton can paint
 * "Cargando...".
 *
 * Pre-paint: writeChatsPrepaintHandoffMarker (pointerdown / exit begin) + inline
 * head bootstrap install DOM attrs before React effects; this module then takes
 * over and clears the prepaint marker after React suppress is live.
 */

import {
  CHATS_PREPAINT_TTL_MS,
  clearChatsPrepaintHandoffMarker,
  installChatsPrepaintSuppressDom,
  isChatsPrepaintHandoffActive,
  rehydrateChatsPrepaintFromSession,
  writeChatsPrepaintHandoffMarker,
} from "@/lib/chats/chatsPrepaintHandoff";

const SESSION_UNTIL_KEY = "sayittome:chats-sequence-handoff-suppress-until";
const SESSION_TX_KEY = "sayittome:chats-sequence-handoff-suppress-tx";

function prepaintTtlFromArmMs(ms: number) {
  return Math.min(CHATS_PREPAINT_TTL_MS, Math.max(ms + 400, 1200));
}

let chatsSequenceHandoffSuppressUntil = 0;
let chatsSequenceHandoffSuppressTxId: string | null = null;

function syncChatsHandoffSuppressDataset() {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (Date.now() < chatsSequenceHandoffSuppressUntil) {
    html.dataset.chatsHandoffSuppress = "1";
    html.dataset.chatsPostAuthSettle = "1";
    html.dataset.tabPostAuthSettle = "1";
  } else if (!isChatsPrepaintHandoffActive()) {
    delete html.dataset.chatsHandoffSuppress;
  }
}

function persistChatsHandoffSuppressSession() {
  if (typeof window === "undefined") return;
  try {
    if (Date.now() >= chatsSequenceHandoffSuppressUntil) {
      window.sessionStorage.removeItem(SESSION_UNTIL_KEY);
      window.sessionStorage.removeItem(SESSION_TX_KEY);
      return;
    }
    window.sessionStorage.setItem(
      SESSION_UNTIL_KEY,
      String(chatsSequenceHandoffSuppressUntil),
    );
    if (chatsSequenceHandoffSuppressTxId) {
      window.sessionStorage.setItem(SESSION_TX_KEY, chatsSequenceHandoffSuppressTxId);
    } else {
      window.sessionStorage.removeItem(SESSION_TX_KEY);
    }
  } catch {
    /* ignore */
  }
}

function hydrateChatsHandoffSuppressFromSession() {
  if (typeof window === "undefined") return false;
  // Prepaint marker may exist before suppress-until; install DOM immediately.
  const prepaint = rehydrateChatsPrepaintFromSession();
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
    chatsSequenceHandoffSuppressUntil = Math.max(chatsSequenceHandoffSuppressUntil, until);
    chatsSequenceHandoffSuppressTxId =
      window.sessionStorage.getItem(SESSION_TX_KEY) || chatsSequenceHandoffSuppressTxId;
    syncChatsHandoffSuppressDataset();
    try {
      document.documentElement.dataset.chatsHandoffSuppressRehydrated = "1";
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
            event: "TAB_HANDOFF_CHATS_PREPAINT_TO_REACT_SUPPRESS_HANDOFF",
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
  hydrateChatsHandoffSuppressFromSession();
}

/** Arm / extend internal Chats handoff suppress (settle + post-guard grace). */
export function armChatsSequenceHandoffSuppress(
  ms = 480,
  opts?: { txId?: string | null; from?: string | null },
) {
  hydrateChatsHandoffSuppressFromSession();
  const until = Date.now() + Math.max(0, ms);
  const txId = opts?.txId ?? null;
  if (txId) {
    chatsSequenceHandoffSuppressTxId = txId;
  }
  if (until > chatsSequenceHandoffSuppressUntil) {
    chatsSequenceHandoffSuppressUntil = until;
  }
  // Keep prepaint marker alive across the arm window when from is known.
  if (opts?.from && opts.from !== "/chats") {
    writeChatsPrepaintHandoffMarker({
      from: opts.from,
      txId,
      ttlMs: prepaintTtlFromArmMs(ms),
    });
  } else if (isChatsPrepaintHandoffActive()) {
    installChatsPrepaintSuppressDom({ via: "arm-suppress", fromMarker: true });
  }
  persistChatsHandoffSuppressSession();
  syncChatsHandoffSuppressDataset();
}

export function isChatsSequenceHandoffSuppressActive(opts?: {
  txId?: string | null;
}) {
  hydrateChatsHandoffSuppressFromSession();
  if (Date.now() >= chatsSequenceHandoffSuppressUntil) {
    persistChatsHandoffSuppressSession();
    // Prepaint may still cover the first-paint window after until expiry race.
    if (isChatsPrepaintHandoffActive()) {
      syncChatsHandoffSuppressDataset();
      return true;
    }
    return false;
  }
  if (
    opts?.txId &&
    chatsSequenceHandoffSuppressTxId &&
    opts.txId !== chatsSequenceHandoffSuppressTxId
  ) {
    return false;
  }
  syncChatsHandoffSuppressDataset();
  return true;
}

export function clearChatsSequenceHandoffSuppress(opts?: {
  txId?: string | null;
  force?: boolean;
}) {
  if (
    !opts?.force &&
    opts?.txId &&
    chatsSequenceHandoffSuppressTxId &&
    opts.txId !== chatsSequenceHandoffSuppressTxId
  ) {
    return false;
  }
  chatsSequenceHandoffSuppressUntil = 0;
  chatsSequenceHandoffSuppressTxId = null;
  persistChatsHandoffSuppressSession();
  clearChatsPrepaintHandoffMarker({
    force: true,
    reason: opts?.force ? "force-clear-suppress" : "clear-suppress",
  });
  if (typeof document !== "undefined") {
    delete document.documentElement.dataset.chatsHandoffSuppress;
    delete document.documentElement.dataset.chatsHandoffSuppressRehydrated;
  }
  return true;
}

/**
 * After React suppress is live and loading is stable-false, drop the prepaint
 * dataset so only the canonical suppress token owns CSS. Marker session key
 * may already be TTL-expired.
 */
export function handoffChatsPrepaintToReactSuppress(detail?: { reason?: string }) {
  if (!isChatsSequenceHandoffSuppressActive()) return false;
  syncChatsHandoffSuppressDataset();
  clearChatsPrepaintHandoffMarker({
    reason: detail?.reason ?? "react-suppress-takeover",
  });
  // Re-assert React suppress datasets after prepaint clear.
  syncChatsHandoffSuppressDataset();
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
        event: "TAB_HANDOFF_CHATS_PREPAINT_TO_REACT_SUPPRESS_HANDOFF",
        reason: detail?.reason ?? "react-suppress-takeover",
      },
    ]);
  } catch {
    /* ignore */
  }
  return true;
}

export function getChatsSequenceHandoffSuppressTxId() {
  hydrateChatsHandoffSuppressFromSession();
  return chatsSequenceHandoffSuppressTxId;
}

/** True when suppress was restored from session after a remount / module reinit. */
export function wasChatsHandoffSuppressRehydratedFromSession() {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.chatsHandoffSuppressRehydrated === "1";
}

export {
  writeChatsPrepaintHandoffMarker,
  isChatsPrepaintHandoffActive,
  clearChatsPrepaintHandoffMarker,
  rehydrateChatsPrepaintFromSession,
} from "@/lib/chats/chatsPrepaintHandoff";
