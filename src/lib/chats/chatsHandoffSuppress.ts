/**
 * Internal Chats handoff suppress window (settle + short post-guard grace).
 * Direct cold /chats never arms this — only handoff begin/scheduleClear paths.
 * Suppress is tx-scoped so a stale Chats arm cannot outlive its handoff token.
 */
let chatsSequenceHandoffSuppressUntil = 0;
let chatsSequenceHandoffSuppressTxId: string | null = null;

/** Arm / extend internal Chats handoff suppress (settle + post-guard grace). */
export function armChatsSequenceHandoffSuppress(
  ms = 480,
  opts?: { txId?: string | null },
) {
  const until = Date.now() + Math.max(0, ms);
  const txId = opts?.txId ?? null;
  if (txId) {
    chatsSequenceHandoffSuppressTxId = txId;
  }
  if (until > chatsSequenceHandoffSuppressUntil) {
    chatsSequenceHandoffSuppressUntil = until;
  }
}

export function isChatsSequenceHandoffSuppressActive(opts?: {
  txId?: string | null;
}) {
  if (Date.now() >= chatsSequenceHandoffSuppressUntil) return false;
  if (
    opts?.txId &&
    chatsSequenceHandoffSuppressTxId &&
    opts.txId !== chatsSequenceHandoffSuppressTxId
  ) {
    return false;
  }
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
  return true;
}

export function getChatsSequenceHandoffSuppressTxId() {
  return chatsSequenceHandoffSuppressTxId;
}
