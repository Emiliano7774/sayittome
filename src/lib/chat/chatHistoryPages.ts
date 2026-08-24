export const CHAT_MESSAGE_PAGE_SIZE = 50;

export type ScrollAnchor = {
  height: number;
  top: number;
};

export function captureScrollAnchor(
  node: Pick<HTMLElement, "scrollHeight" | "scrollTop"> | null | undefined,
): ScrollAnchor | null {
  if (!node) return null;
  return { height: node.scrollHeight, top: node.scrollTop };
}

/** Keep the same content under the viewport after older rows are prepended. */
export function restoreScrollAnchor(
  node: Pick<HTMLElement, "scrollHeight" | "scrollTop"> | null | undefined,
  anchor: ScrollAnchor | null | undefined,
) {
  if (!node || !anchor) return;
  node.scrollTop = node.scrollHeight - (anchor.height - anchor.top);
}

export type HistoryMessageKey = {
  id?: string;
  clientId?: string;
};

/**
 * Live listener is a sliding tail window. Older pages must survive upserts:
 * keep ids already in `prev` that fell out of `liveWindow`, then merge pending.
 */
export function mergeLiveWindowIntoHistory<T extends HistoryMessageKey>(
  prev: T[],
  liveWindow: T[],
  pending: T[],
  mergePending: (loaded: T[], pendingRows: T[]) => T[],
): T[] {
  const liveIds = new Set(
    liveWindow.map((row) => String(row.id || "").trim()).filter(Boolean),
  );
  const liveClientIds = new Set(
    liveWindow.map((row) => String(row.clientId || "").trim()).filter(Boolean),
  );

  const older = prev.filter((row) => {
    const id = String(row.id || "").trim();
    const clientId = String(row.clientId || "").trim();
    if (id && liveIds.has(id)) return false;
    if (clientId && liveClientIds.has(clientId)) return false;
    // Drop unresolved optimistics — mergePending reattaches them.
    if (row && "status" in row) {
      const status = (row as { status?: string }).status;
      if (status === "sending" || status === "error") return false;
    }
    return Boolean(id || clientId);
  });

  const combined = [...older, ...liveWindow];
  const byId = new Map<string, T>();
  for (const row of combined) {
    const key =
      String(row.id || "").trim() ||
      String(row.clientId || "").trim() ||
      "";
    if (!key) continue;
    byId.set(key, row);
  }
  const ordered = [...byId.values()];
  return mergePending(ordered, pending);
}

export function prependOlderMessages<T extends HistoryMessageKey>(
  current: T[],
  older: T[],
): T[] {
  if (!older.length) return current;
  const seen = new Set(
    current
      .map((row) => String(row.id || row.clientId || "").trim())
      .filter(Boolean),
  );
  const uniqueOlder = older.filter((row) => {
    const key = String(row.id || row.clientId || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!uniqueOlder.length) return current;
  return [...uniqueOlder, ...current];
}
