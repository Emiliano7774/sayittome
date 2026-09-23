import {
  isLiveUsageVisit,
  usageActorKey,
  usageDayKey,
  type UsageVisitRecord,
} from "@/lib/usage/appUsage";

export type UsageActivityEvent = {
  uid: string;
  username: string;
  atMs: number;
  anonymous: boolean;
};

export type UsageSourceDoc = {
  id: string;
  createTime?: string;
  updateTime?: string;
  data: Record<string, unknown>;
};

const EARLIEST_MS = Date.parse("2024-01-01T00:00:00.000Z");

export function isPlausibleUsageMs(ms: number, now = Date.now()) {
  return Number.isFinite(ms) && ms >= EARLIEST_MS && ms <= now + 36 * 60 * 60 * 1000;
}

export function usageTimestampMs(value: unknown, now = Date.now()): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return isPlausibleUsageMs(ms, now) ? ms : null;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) && isPlausibleUsageMs(ms, now) ? ms : null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return isPlausibleUsageMs(ms, now) ? ms : null;
  }
  if (typeof value === "object") {
    const record = value as {
      seconds?: number;
      _seconds?: number;
      toDate?: () => Date;
    };
    if (typeof record.toDate === "function") {
      const ms = record.toDate().getTime();
      return isPlausibleUsageMs(ms, now) ? ms : null;
    }
    const seconds = record._seconds ?? record.seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      const ms = seconds * 1000;
      return isPlausibleUsageMs(ms, now) ? ms : null;
    }
  }
  return null;
}

function cleanId(value: unknown) {
  const id = String(value || "").trim();
  if (!id || id.length > 180 || id.includes("/") || id.includes("\\")) return "";
  return id;
}

function cleanUsername(value: unknown) {
  return String(value || "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 80);
}

export function resolveUsageActor(rawId: unknown, anonymousHint = false) {
  const raw = cleanId(rawId);
  if (!raw) return null;
  if (anonymousHint || raw.startsWith("anon_") || raw.startsWith("anon-")) {
    return { uid: raw.replace(/^profile_/, ""), anonymous: true };
  }
  const uid = raw.startsWith("profile_") ? raw.slice("profile_".length) : raw;
  if (!uid) return null;
  return { uid, anonymous: false };
}

function pushEvent(
  events: UsageActivityEvent[],
  actor: { uid: string; anonymous: boolean } | null,
  username: string,
  atMs: number | null,
) {
  if (!actor || atMs == null) return;
  events.push({
    uid: actor.uid,
    username: actor.anonymous ? "" : username,
    atMs,
    anonymous: actor.anonymous,
  });
}

/** Explicit activity instants. Document updateTime and profile updatedAt are system writes, not entries. */
function activityInstants(doc: UsageSourceDoc, keys: string[], now: number) {
  const found = keys
    .map((key) => usageTimestampMs(doc.data[key], now))
    .filter((ms): ms is number => ms != null);
  if (found.length > 0) return found;
  const created = usageTimestampMs(doc.createTime, now);
  return created == null ? [] : [created];
}

export function usageEventsFromProfile(doc: UsageSourceDoc, now = Date.now()) {
  const events: UsageActivityEvent[] = [];
  const actor = resolveUsageActor(doc.data.uid || doc.id, false);
  const username = cleanUsername(doc.data.username || doc.data.nombre);
  for (const atMs of activityInstants(
    doc,
    [
      "createdAt",
      "originalCreatedAt",
      "fechaCreacion",
      "fechaRegistro",
      "lastSeenAt",
      "lastActiveAt",
      "lastActive",
      "lastActiveAtClient",
      "presenceUpdatedAt",
    ],
    now,
  )) {
    pushEvent(events, actor, username, atMs);
  }
  return events;
}

export function usageEventsFromStory(doc: UsageSourceDoc, now = Date.now()) {
  const events: UsageActivityEvent[] = [];
  const anonymous = doc.data.isAnonymousStory === true;
  const actor = resolveUsageActor(doc.data.ownerUid || doc.data.anonSessionId, anonymous);
  const username = cleanUsername(doc.data.ownerUsername);
  for (const atMs of activityInstants(doc, ["createdAt"], now)) {
    pushEvent(events, actor, username, atMs);
  }
  return events;
}

export function usageEventsFromFollow(doc: UsageSourceDoc, now = Date.now()) {
  const events: UsageActivityEvent[] = [];
  const actor = resolveUsageActor(doc.data.seguidorUid, false);
  for (const atMs of activityInstants(doc, ["createdAt"], now)) {
    pushEvent(events, actor, "", atMs);
  }
  return events;
}

export function usageEventsFromMessage(doc: UsageSourceDoc, now = Date.now()) {
  const events: UsageActivityEvent[] = [];
  const kind = String(doc.data.senderKind || doc.data.senderRole || "").toLowerCase();
  const anonymous = kind === "anon" || kind === "anonymous";
  const actor = anonymous
    ? resolveUsageActor(doc.data.fromUid || doc.data.senderUid || doc.data.anonSessionId, true)
    : resolveUsageActor(doc.data.profileUid || doc.data.fromUid || doc.data.senderUid, false);
  for (const atMs of activityInstants(doc, ["createdAt"], now)) {
    pushEvent(events, actor, "", atMs);
  }
  return events;
}

export function reconstructUsageDays(events: UsageActivityEvent[], now = Date.now()) {
  const buckets = new Map<
    string,
    {
      uid: string;
      anonymous: boolean;
      username: string;
      firstMs: number;
      lastMs: number;
    }
  >();

  for (const event of events) {
    if (!isPlausibleUsageMs(event.atMs, now)) continue;
    const actor = resolveUsageActor(event.uid, event.anonymous);
    if (!actor) continue;
    const day = usageDayKey(new Date(event.atMs));
    const key = `${day}\n${usageActorKey(actor.uid, actor.anonymous)}`;
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, {
        uid: actor.uid,
        anonymous: actor.anonymous,
        username: actor.anonymous ? "" : event.username,
        firstMs: event.atMs,
        lastMs: event.atMs,
      });
      continue;
    }
    if (event.atMs < current.firstMs) current.firstMs = event.atMs;
    if (event.atMs > current.lastMs) current.lastMs = event.atMs;
    if (!current.username && event.username && !current.anonymous) current.username = event.username;
  }

  const byDay = new Map<string, UsageVisitRecord[]>();
  for (const [key, bucket] of buckets) {
    const day = key.slice(0, key.indexOf("\n"));
    const visit: UsageVisitRecord = {
      actorKey: usageActorKey(bucket.uid, bucket.anonymous),
      kind: bucket.anonymous ? "anonymous" : "registered",
      uid: bucket.uid,
      username: bucket.username,
      enteredAt: new Date(bucket.firstMs).toISOString(),
      lastSeenAt: new Date(bucket.lastMs).toISOString(),
      visibleMs: 0,
      sessions: 1,
      measured: false,
    };
    const list = byDay.get(day) || [];
    list.push(visit);
    byDay.set(day, list);
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, visits]) => ({
      day,
      visits: visits.sort((a, b) => a.actorKey.localeCompare(b.actorKey)),
    }));
}

export function mergeReconstructedVisit(
  existing: UsageVisitRecord | null,
  rebuilt: UsageVisitRecord,
): UsageVisitRecord | null {
  if (isLiveUsageVisit(existing)) return null;
  if (existing?.username && !rebuilt.username) {
    return { ...rebuilt, username: existing.username };
  }
  return rebuilt;
}
