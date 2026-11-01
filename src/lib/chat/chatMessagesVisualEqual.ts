/**
 * Cheap visual equality for chat message lists.
 * Avoids allocating a giant joined signature string on every snapshot.
 * Intentionally omits readBy (same as prior chatMessagesSignature) so
 * receipt-only updates do not force a full list re-render.
 */

export type ChatMessageVisualRow = {
  id?: string;
  clientId?: string;
  mine?: boolean;
  status?: string;
  text?: string;
  mediaUrl?: string;
  deletedForEveryone?: boolean;
  verifiedProfileAttestation?: unknown;
};

function rowKey(message: ChatMessageVisualRow) {
  return message.clientId || message.id || "";
}

function attestationTicket(message: ChatMessageVisualRow) {
  const tip = message.verifiedProfileAttestation as
    | { ticketId?: unknown }
    | null
    | undefined;
  return String(tip?.ticketId || "");
}

export function chatMessagesVisuallyEqual(
  prev: ChatMessageVisualRow[],
  next: ChatMessageVisualRow[],
): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (rowKey(a) !== rowKey(b)) return false;
    if (Boolean(a.mine) !== Boolean(b.mine)) return false;
    if ((a.status || "") !== (b.status || "")) return false;
    if ((a.text || "") !== (b.text || "")) return false;
    if ((a.mediaUrl || "") !== (b.mediaUrl || "")) return false;
    if (Boolean(a.deletedForEveryone) !== Boolean(b.deletedForEveryone)) return false;
    if (attestationTicket(a) !== attestationTicket(b)) return false;
  }
  return true;
}
