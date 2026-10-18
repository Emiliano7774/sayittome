/** Owner-only presence pool. Registered profiles follow Shuffle's 15-minute online filter. */
export type PoolRow = { id: string; data: Record<string, unknown> };
export type ActiveTarget =
  | { type: "anonymous"; id: string; lastSeenMs: number }
  | { type: "profile"; id: string; username: string; lastSeenMs: number };

const ANON_FRESH_MS = 120_000;
const PROFILE_FRESH_MS = 15 * 60_000;
const USERNAME = /^[\p{L}\p{N}_.-]{2,40}$/u;
const ANON_ALIAS = /^anon_[a-z0-9_]{6,80}$/i;

function asTime(raw: unknown): number {
  if (typeof raw === "string") return Date.parse(raw);
  if (raw && typeof raw === "object") {
    const date = raw as {toMillis?: () => number; seconds?: number};
    if (typeof date.toMillis === "function") return date.toMillis();
    if (typeof date.seconds === "number") return date.seconds * 1000;
  }
  return NaN;
}

function fresh(ms: number, nowMs: number, maxAgeMs: number) {
  return Number.isFinite(ms) && ms <= nowMs + 30_000 && nowMs - ms >= -30_000 &&
    nowMs - ms < maxAgeMs;
}

function openAudience(data: Record<string, unknown>) {
  return (!Array.isArray(data.visibilidadPaises) || data.visibilidadPaises.length === 0) &&
    (!Array.isArray(data.visibilidadProvincias) || data.visibilidadProvincias.length === 0);
}

export function activeAdminPresencePool(
  anonymousRows: PoolRow[], profileRows: PoolRow[], nowMs: number,
) {
  const anonymous: ActiveTarget[] = anonymousRows.flatMap((row) => {
    const d = row.data;
    const lastSeenMs = asTime(d.lastSeenAt);
    const dndUntil = asTime(d.doNotDisturbUntil);
    if (!ANON_ALIAS.test(row.id) || d.sessionClosed === true || d.backgrounded === true ||
        d.disponibleParaChat !== true || !openAudience(d) ||
        (Number.isFinite(dndUntil) && dndUntil > nowMs) ||
        !fresh(lastSeenMs, nowMs, ANON_FRESH_MS)) return [];
    return [{type:"anonymous",id:row.id,lastSeenMs}];
  });
  const profiles: ActiveTarget[] = profileRows.flatMap((row) => {
    const d = row.data;
    const username = String(d.username || "").trim();
    // Shuffle uses recent activity rather than the unreliable online flag.
    // Older clients may not write lastForegroundAt at all.
    const lastSeenMs = Math.max(
      ...[d.lastActiveAt,d.lastSeenAt,d.lastActive,d.presenceUpdatedAt,d.lastForegroundAt]
        .map(asTime).filter(Number.isFinite),
      0,
    );
    if (!USERNAME.test(username) || d.banned === true || !openAudience(d) ||
        !fresh(lastSeenMs, nowMs, PROFILE_FRESH_MS)) return [];
    return [{type:"profile",id:row.id,username,lastSeenMs}];
  });
  return {anonymous,profiles};
}

export function chooseAdminPresenceTarget(
  pool: ReturnType<typeof activeAdminPresencePool>,
  previousType: "anonymous" | "profile" | "",
  previousId: string,
): ActiveTarget | null {
  // When both types are present, rotate fairly between them.
  const preferred = previousType === "anonymous" ? pool.profiles : pool.anonymous;
  const fallback = previousType === "anonymous" ? pool.anonymous : pool.profiles;
  const bucket = preferred.length ? preferred : fallback;
  if (!bucket.length) return null;
  const sorted = [...bucket].sort((a,b) => b.lastSeenMs - a.lastSeenMs);
  return sorted.find(p => p.id !== previousId) || sorted[0];
}
