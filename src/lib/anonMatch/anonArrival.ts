export const ANON_ARRIVAL_TOPIC = "anon-presence-optin-v1";
export const ANON_ARRIVAL_MIN_REANNOUNCE_MS = 60 * 1000;
export const ANON_ARRIVAL_FRESH_MS = 60 * 1000;

export function isNewAnonymousArrival(input: {
  priorLastSeenAt?: unknown; priorEnteredAt?: unknown;
  priorAnnouncedAt?: unknown; priorSessionClosed?: unknown;
  priorSessionClosedAt?: unknown; priorBackgrounded?: unknown;
  clientAwaySinceMs?: unknown;
  nowMs: number;
}) {
  const seen = Date.parse(String(input.priorLastSeenAt || ""));
  const announced = Date.parse(String(input.priorAnnouncedAt || ""));
  const left = Date.parse(String(input.priorSessionClosedAt || ""));
  // CRITICAL: the normal foreground heartbeat is 90 seconds, so a 60-second
  // timestamp gap alone MUST NOT be called a reconnection. It previously
  // generated phantom push events every 90 seconds from an uninterrupted tab.
  // Require a real background/closed transition, preserved in the same
  // existing presence document (no extra Firestore reads or writes).
  const firstEntrance = !Number.isFinite(seen);
  const fromClosedSession = input.priorSessionClosed === true &&
    (!Number.isFinite(left) || input.nowMs - left >= ANON_ARRIVAL_FRESH_MS);
  const fromBackground = input.priorSessionClosed !== true &&
    input.priorBackgrounded === true &&
    Number.isFinite(seen) && input.nowMs - seen >= ANON_ARRIVAL_FRESH_MS;
  const awaySince = Number(input.clientAwaySinceMs || 0);
  // A browser can be suspended before its background POST is delivered.
  // A locally recorded exit is eligible only after a full minute. The
  // existing authoritative announcement gate still prevents fast repeats.
  const resumedAfterFullMinute = Number.isFinite(awaySince) && awaySince > 0 &&
    input.nowMs - awaySince >= ANON_ARRIVAL_FRESH_MS && awaySince <= input.nowMs;
  const gapSincePush = !Number.isFinite(announced) ||
    input.nowMs - announced >= ANON_ARRIVAL_MIN_REANNOUNCE_MS;
  return (firstEntrance || fromClosedSession || fromBackground || resumedAfterFullMinute) && gapSincePush;
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