/**
 * Performance-only fast path for server-confirmed readBy updates.
 * The chat's visual equality already excludes readBy, so remapping the full
 * 50-message window on a receipt-only modification cannot change the UI.
 * A strict comparison of every OTHER raw field preserves unknown future
 * media, moderation, authorship, and deletion fields.
 */
export type ReceiptChange = {
  id: string;
  type: "added" | "modified" | "removed";
  data: Record<string, unknown>;
};
export type ReceiptSnapshotState = {
  serverReady: boolean;
  signatures: Map<string, string>;
};
export function nonReceiptSignature(data: Record<string, unknown>): string {
  const { readBy: _readBy, ...rest } = data;
  return JSON.stringify(rest);
}
export function isConfirmedReceiptOnlySnapshot(
  changes: ReceiptChange[],
  previous: ReceiptSnapshotState,
  metadata: { fromCache: boolean; hasPendingWrites: boolean },
): boolean {
  if (!previous.serverReady || metadata.fromCache || metadata.hasPendingWrites || changes.length === 0) {
    return false;
  }
  return changes.every((change) =>
    change.type === "modified" &&
    previous.signatures.has(change.id) &&
    previous.signatures.get(change.id) === nonReceiptSignature(change.data),
  );
}
export function captureReceiptSnapshotSignatures(
  rows: Array<{ id: string; data: Record<string, unknown> }>,
  metadata: { fromCache: boolean; hasPendingWrites: boolean },
): ReceiptSnapshotState {
  return {
    serverReady: !metadata.fromCache && !metadata.hasPendingWrites,
    signatures: new Map(rows.map((row) => [row.id, nonReceiptSignature(row.data)])),
  };
}
/**
 * Update only changed documents' signatures after the first snapshot.
 * Normal incoming messages should not stringify all 50 chat rows twice.
 */
export function advanceReceiptSnapshotSignatures(
  previous: ReceiptSnapshotState,
  changes: ReceiptChange[],
  size: number,
  allRows: () => Array<{ id: string; data: Record<string, unknown> }>,
  metadata: { fromCache: boolean; hasPendingWrites: boolean },
): ReceiptSnapshotState {
  if (previous.signatures.size === 0) return captureReceiptSnapshotSignatures(allRows(), metadata);
  const signatures = new Map(previous.signatures);
  for (const change of changes) {
    if (change.type === "removed") signatures.delete(change.id);
    else signatures.set(change.id, nonReceiptSignature(change.data));
  }
  if (signatures.size !== size) return captureReceiptSnapshotSignatures(allRows(), metadata);
  return {
    signatures,
    serverReady: !metadata.fromCache && !metadata.hasPendingWrites,
  };
}

