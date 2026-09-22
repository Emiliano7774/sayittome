/** Pure mapping for the admin review of chats_anonimos. No I/O. */

export function firestoreTimeMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return 0;
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber < 1e12 ? Math.round(asNumber * 1000) : Math.round(asNumber);
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object") {
    const row = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof row.toMillis === "function") {
      try {
        const ms = Number(row.toMillis());
        return Number.isFinite(ms) && ms > 0 ? ms : 0;
      } catch {
        return 0;
      }
    }
    const seconds = Number(row.seconds ?? row._seconds);
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  }
  return 0;
}

export function anonMatchMessageText(data: Record<string, unknown>): string {
  return String(data.texto || data.text || data.mensaje || data.message || "").trim();
}

export function anonMatchActivityMs(data: Record<string, unknown>): number {
  return firestoreTimeMs(data.updatedAt) || firestoreTimeMs(data.createdAt);
}
