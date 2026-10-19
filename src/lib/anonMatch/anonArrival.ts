export const ANON_ARRIVAL_TOPIC = "anon-presence-optin-v1";
export const ANON_ARRIVAL_MIN_REANNOUNCE_MS = 60 * 1000;
export const ANON_ARRIVAL_FRESH_MS = 60 * 1000;

export function isNewAnonymousArrival(input: {
  priorLastSeenAt?: unknown; priorEnteredAt?: unknown;
  priorAnnouncedAt?: unknown; priorSessionClosed?: unknown;
  priorSessionClosedAt?: unknown;
  priorBackgrounded?: unknown; priorBackgroundedAt?: unknown;
  priorLastForegroundAt?: unknown; resumedFromAt?: unknown;
  nowMs: number;
}) {
  const seen = Date.parse(String(input.priorLastSeenAt || ""));
  const announced = Date.parse(String(input.priorAnnouncedAt || ""));
  const left = Date.parse(String(input.priorSessionClosedAt || ""));
  const backgroundSince = Date.parse(String(input.priorBackgroundedAt || ""));
  const lastForeground = Date.parse(String(input.priorLastForegroundAt || ""));
  const resumedFrom = Date.parse(String(input.resumedFromAt || ""));

  // Browser lifecycle: visibilitychange can fire before focus. The hidden
  // heartbeat on the return must NOT erase the original departure time.
  // Explicit resume also covers Chrome/Brave suspending the hidden request.
  const validResume = Number.isFinite(resumedFrom) &&
    resumedFrom <= input.nowMs - ANON_ARRIVAL_FRESH_MS &&
    resumedFrom >= input.nowMs - 24 * 60 * 60_000 &&
    (!Number.isFinite(lastForeground) || lastForeground <= resumedFrom + 30_000);

  // Every live foreground heartbeat updates lastSeenAt. A 90s throttled
  // heartbeat is NOT a reentry, even if 60s elapsed since its previous write.
  const wasAway = input.priorSessionClosed === true
    ? (!Number.isFinite(left) || input.nowMs - left >= ANON_ARRIVAL_FRESH_MS)
    : validResume || (input.priorBackgrounded === true
      ? (!Number.isFinite(backgroundSince)
          ? !Number.isFinite(seen) || input.nowMs-seen >= ANON_ARRIVAL_FRESH_MS
          : input.nowMs-backgroundSince >= ANON_ARRIVAL_FRESH_MS)
      : !Number.isFinite(lastForeground) &&
        (!Number.isFinite(seen) || input.nowMs-seen >= ANON_ARRIVAL_FRESH_MS));
  const gapSincePush = !Number.isFinite(announced) ||
    input.nowMs - announced >= ANON_ARRIVAL_MIN_REANNOUNCE_MS;
  return wasAway && gapSincePush;
}

export function isAnonArrivalGloballyVisible(input: { paises?: unknown; provincias?: unknown; doNotDisturb?: boolean }) {
  // Never broadcast someone who restricted their Shuffle audience.
  return input.doNotDisturb !== true &&
    (!Array.isArray(input.paises) || input.paises.length === 0) &&
    (!Array.isArray(input.provincias) || input.provincias.length === 0);
}

export function isAnonArrivalAlias(raw: unknown): raw is string {
  return typeof raw === "string" && /^anon_[a-z0-9_]{6,80}$/i.test(raw);
}

export function anonArrivalPublicLabel(alias: string) {
  // Stable short ID, no account name or identifying information.
  let n = 2166136261;
  for (const ch of alias) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return (n >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(-7);
}