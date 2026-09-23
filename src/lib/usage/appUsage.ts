export const USAGE_TIME_ZONE = "America/Argentina/Buenos_Aires";
export const USAGE_PING_MAX_MS = 120_000;
export const USAGE_SESSION_GAP_MS = 20_000;
export const USAGE_HISTORY_DAYS = 14;
export const USAGE_COLLECTION = "app_usage_days";

export type UsageVisitRecord = {
  actorKey: string;
  kind: "registered" | "anonymous";
  uid: string;
  username: string;
  enteredAt: string;
  lastSeenAt: string;
  visibleMs: number;
  sessions: number;
  /** True when foreground pings measured this visit. Reconstructed days stay false. */
  measured: boolean;
};

export function usageDayKey(now = new Date(), timeZone = USAGE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

export function shiftUsageDayKey(dayKey: string, deltaDays: number) {
  const [year, month, day] = dayKey.split("-").map((part) => Number(part));
  if (!year || !month || !day) return dayKey;
  return usageDayKey(new Date(Date.UTC(year, month - 1, day + deltaDays, 15, 0, 0)));
}

export function recentUsageDayKeys(today: string, count = USAGE_HISTORY_DAYS) {
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    keys.push(shiftUsageDayKey(today, -offset));
  }
  return keys;
}

/** Inclusive YYYY-MM-DD range. Stops at 500 days so a bad timestamp cannot fan out. */
export function usageDayKeysBetween(startDay: string, endDay: string) {
  if (!isUsageDayKey(startDay) || !isUsageDayKey(endDay) || startDay > endDay) return [];
  const keys: string[] = [];
  let cursor = startDay;
  for (let guard = 0; guard < 500; guard += 1) {
    keys.push(cursor);
    if (cursor === endDay) break;
    const next = shiftUsageDayKey(cursor, 1);
    if (next === cursor || next < cursor) break;
    cursor = next;
  }
  return keys;
}

export function isUsageDayKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function clampUsageVisibleMs(value: unknown) {
  const ms = Math.floor(Number(value));
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(USAGE_PING_MAX_MS, ms);
}

function wallClockCap(existing: UsageVisitRecord | null, nowIso: string, requested: unknown) {
  const added = clampUsageVisibleMs(requested);
  if (!existing || added === 0) return added;
  const gap = Date.parse(nowIso) - Date.parse(existing.lastSeenAt);
  if (!Number.isFinite(gap) || gap < 0) return 0;
  return Math.min(added, gap + 5_000);
}

export function usageActorKey(uid: string, anonymous: boolean) {
  const clean = String(uid || "").trim();
  return anonymous ? `anon_${clean}` : clean;
}

export function applyUsagePing(
  existing: UsageVisitRecord | null,
  input: {
    nowIso: string;
    visibleMs: unknown;
    sessionStart: boolean;
    username: string;
    uid: string;
    anonymous: boolean;
  },
): UsageVisitRecord {
  const actorKey = usageActorKey(input.uid, input.anonymous);
  const username = input.anonymous ? "" : String(input.username || "").trim().slice(0, 80);
  const added = wallClockCap(existing, input.nowIso, input.visibleMs);

  if (!existing) {
    return {
      actorKey,
      kind: input.anonymous ? "anonymous" : "registered",
      uid: input.uid,
      username,
      enteredAt: input.nowIso,
      lastSeenAt: input.nowIso,
      visibleMs: added,
      sessions: 1,
      measured: true,
    };
  }

  const gap = Date.parse(input.nowIso) - Date.parse(existing.lastSeenAt);
  const countSession =
    input.sessionStart && Number.isFinite(gap) && gap >= USAGE_SESSION_GAP_MS;

  return {
    ...existing,
    actorKey,
    kind: input.anonymous ? "anonymous" : "registered",
    uid: input.uid,
    username: existing.username || username,
    lastSeenAt: input.nowIso,
    visibleMs: Math.max(0, Math.floor(existing.visibleMs) || 0) + added,
    sessions: Math.max(1, Math.floor(existing.sessions) || 1) + (countSession ? 1 : 0),
    measured: true,
  };
}

export function readUsageVisit(raw: Record<string, unknown> | null | undefined): UsageVisitRecord | null {
  if (!raw) return null;
  const uid = String(raw.uid || "").trim();
  const actorKey = String(raw.actorKey || "").trim();
  if (!uid || !actorKey) return null;
  const kind = raw.kind === "anonymous" ? "anonymous" : "registered";
  return {
    actorKey,
    kind,
    uid,
    username: String(raw.username || "").trim().slice(0, 80),
    enteredAt: String(raw.enteredAt || ""),
    lastSeenAt: String(raw.lastSeenAt || ""),
    visibleMs: Math.max(0, Math.floor(Number(raw.visibleMs) || 0)),
    sessions: Math.max(0, Math.floor(Number(raw.sessions) || 0)),
    measured: raw.measured === true,
  };
}

export function isLiveUsageVisit(visit: UsageVisitRecord | null) {
  return Boolean(visit && (visit.measured || visit.visibleMs > 0));
}

export type UsageDaySummary = {
  entries: number;
  registered: number;
  anonymous: number;
  sessions: number;
  totalVisibleMs: number;
  averageVisibleMs: number;
  measuredEntries: number;
  timedEntries: number;
};

export function emptyUsageDaySummary(): UsageDaySummary {
  return {
    entries: 0,
    registered: 0,
    anonymous: 0,
    sessions: 0,
    totalVisibleMs: 0,
    averageVisibleMs: 0,
    measuredEntries: 0,
    timedEntries: 0,
  };
}

export function summarizeUsageVisits(visits: UsageVisitRecord[]): UsageDaySummary {
  const registered = visits.filter((visit) => visit.kind === "registered").length;
  const totalVisibleMs = visits.reduce((sum, visit) => sum + visit.visibleMs, 0);
  const sessions = visits.reduce((sum, visit) => sum + visit.sessions, 0);
  const timedEntries = visits.filter((visit) => visit.visibleMs > 0).length;
  const averageVisibleMs = timedEntries ? Math.round(totalVisibleMs / timedEntries) : 0;

  return {
    entries: visits.length,
    registered,
    anonymous: visits.length - registered,
    sessions,
    totalVisibleMs,
    averageVisibleMs,
    measuredEntries: visits.filter((visit) => visit.measured || visit.visibleMs > 0).length,
    timedEntries,
  };
}

export function readUsageDaySummary(
  raw: Record<string, unknown> | null | undefined,
): UsageDaySummary | null {
  if (!raw || raw.entries == null) return null;
  const summary = emptyUsageDaySummary();
  summary.entries = Math.max(0, Math.floor(Number(raw.entries) || 0));
  summary.registered = Math.max(0, Math.floor(Number(raw.registered) || 0));
  summary.anonymous = Math.max(
    0,
    Math.floor(Number(raw.anonymous) || Math.max(0, summary.entries - summary.registered)),
  );
  summary.sessions = Math.max(0, Math.floor(Number(raw.sessions) || 0));
  summary.totalVisibleMs = Math.max(0, Math.floor(Number(raw.totalVisibleMs) || 0));
  summary.measuredEntries = Math.max(0, Math.floor(Number(raw.measuredEntries) || 0));
  summary.timedEntries =
    raw.timedEntries == null
      ? summary.totalVisibleMs > 0
        ? summary.entries
        : 0
      : Math.max(0, Math.floor(Number(raw.timedEntries) || 0));
  summary.averageVisibleMs = summary.timedEntries
    ? Math.round(summary.totalVisibleMs / summary.timedEntries)
    : 0;
  return summary;
}

export function formatUsageDuration(ms: number) {
  const safe = Math.max(0, Math.floor(Number(ms) || 0));
  if (safe <= 0) return "0 min";
  const totalMinutes = Math.round(safe / 60_000);
  if (totalMinutes < 1) return "< 1 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}
