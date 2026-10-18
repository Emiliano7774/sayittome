export const ANON_ARRIVAL_TOPIC = "anon-presence-optin-v1";
export const ANON_ARRIVAL_MIN_REANNOUNCE_MS = 60 * 1000;
export const ANON_ARRIVAL_FRESH_MS = 60 * 1000;

export function isNewAnonymousArrival(input: {
  priorLastSeenAt?: unknown; priorEnteredAt?: unknown;
  priorAnnouncedAt?: unknown; priorSessionClosed?: unknown;
  priorSessionClosedAt?: unknown;
  nowMs: number;
}) {
  const seen = Date.parse(String(input.priorLastSeenAt || ""));
  const announced = Date.parse(String(input.priorAnnouncedAt || ""));
  const left = Date.parse(String(input.priorSessionClosedAt || ""));
  // If the tab explicitly closed, measure the interval from its departure,
  // not from its last heartbeat. The Shuffle card still lives for three hours.
  const wasAway = input.priorSessionClosed === true
    ? (!Number.isFinite(left) || input.nowMs - left >= ANON_ARRIVAL_FRESH_MS)
    : (!Number.isFinite(seen) || input.nowMs - seen >= ANON_ARRIVAL_FRESH_MS);
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