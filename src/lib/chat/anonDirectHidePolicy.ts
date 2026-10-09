/** Shared pure invariants for participant-only anonymous inbox hiding. */
export function anonDirectCanHideChat(
  viewerUid: string,
  requesterAuthUid: string,
  recipientAuthUid: string,
): boolean {
  const uid = String(viewerUid || "").trim();
  return Boolean(uid) && (uid === requesterAuthUid || uid === recipientAuthUid);
}

export function anonDirectMessageMarker(
  latestMessageId: unknown,
  lastMessageAtMs: unknown,
): string {
  const id = String(latestMessageId || "").trim();
  if (id) return `m:${id}`;
  const ms = Number(lastMessageAtMs || 0);
  return Number.isFinite(ms) && ms > 0 ? `t:${ms}` : "__empty__";
}

export function anonDirectIsHiddenForViewer(
  viewerUid: string,
  hiddenAtMessageByUid: Record<string, string> | undefined,
  latestMessageId: unknown,
  lastMessageAtMs: unknown,
): boolean {
  const uid = String(viewerUid || "").trim();
  if (!uid) return false;
  return hiddenAtMessageByUid?.[uid] ===
    anonDirectMessageMarker(latestMessageId, lastMessageAtMs);
}
