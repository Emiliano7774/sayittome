export const ANON_ARRIVAL_TOPIC = "anon-presence-optin-v1";
export const ANON_ARRIVAL_MIN_REANNOUNCE_MS = 15 * 60 * 1000;
export const ANON_ARRIVAL_FRESH_MS = 15 * 60 * 1000;

export function isNewAnonymousArrival(input: {
  priorLastSeenAt?: unknown; priorEnteredAt?: unknown;
  priorAnnouncedAt?: unknown; priorSessionClosed?: unknown;
  nowMs: number;
}) {
  const seen = Date.parse(String(input.priorLastSeenAt || ""));
  const announced = Date.parse(String(input.priorAnnouncedAt || ""));
  const newSession = input.priorSessionClosed === true ||
    !Number.isFinite(seen) || input.nowMs - seen > ANON_ARRIVAL_FRESH_MS;
  // An explicit session close followed by a fresh entry is a real arrival,
  // even when the same alias reconnects within the previous 15-minute window.
  // Heartbeats never pass newSession; push fan-out has a separate global cap.
  const cooldownOk = input.priorSessionClosed === true ||
    !Number.isFinite(announced) || input.nowMs - announced >= ANON_ARRIVAL_MIN_REANNOUNCE_MS;
  return newSession && cooldownOk;
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