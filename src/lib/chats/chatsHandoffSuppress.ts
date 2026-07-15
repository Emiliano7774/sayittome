/**
 * Internal Chats handoff suppress window (settle + short post-guard grace).
 * Direct cold /chats never arms this — only handoff begin/scheduleClear paths.
 * Suppress is tx-scoped so a stale Chats arm cannot outlive its handoff token.
 *
 * Session-persisted so SoftNavigate context-destroy remounts (Shuffle→Chats)
 * rehydrate suppress + CSS datasets before the inbox skeleton can paint
 * "Cargando...".
 */

const SESSION_UNTIL_KEY = "sayittome:chats-sequence-handoff-suppress-until";
const SESSION_TX_KEY = "sayittome:chats-sequence-handoff-suppress-tx";

let chatsSequenceHandoffSuppressUntil = 0;
let chatsSequenceHandoffSuppressTxId: string | null = null;

function syncChatsHandoffSuppressDataset() {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (Date.now() < chatsSequenceHandoffSuppressUntil) {
    html.dataset.chatsHandoffSuppress = "1";
    html.dataset.chatsPostAuthSettle = "1";
    html.dataset.tabPostAuthSettle = "1";
  } else {
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
  try {
    const untilRaw = window.sessionStorage.getItem(SESSION_UNTIL_KEY);
    const until = untilRaw ? Number(untilRaw) : 0;
    if (!Number.isFinite(until) || until <= Date.now()) {
      window.sessionStorage.removeItem(SESSION_UNTIL_KEY);
      window.sessionStorage.removeItem(SESSION_TX_KEY);
      return false;
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
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  hydrateChatsHandoffSuppressFromSession();
}

/** Arm / extend internal Chats handoff suppress (settle + post-guard grace). */
export function armChatsSequenceHandoffSuppress(
  ms = 480,
  opts?: { txId?: string | null },
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
  persistChatsHandoffSuppressSession();
  syncChatsHandoffSuppressDataset();
}

export function isChatsSequenceHandoffSuppressActive(opts?: {
  txId?: string | null;
}) {
  hydrateChatsHandoffSuppressFromSession();
  if (Date.now() >= chatsSequenceHandoffSuppressUntil) {
    persistChatsHandoffSuppressSession();
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
  if (typeof document !== "undefined") {
    delete document.documentElement.dataset.chatsHandoffSuppress;
    delete document.documentElement.dataset.chatsHandoffSuppressRehydrated;
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
