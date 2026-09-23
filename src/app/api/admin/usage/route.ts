import { NextResponse } from "next/server";

import { verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";
import {
  USAGE_COLLECTION,
  isUsageDayKey,
  readUsageVisit,
  shiftUsageDayKey,
  summarizeUsageVisits,
  usageDayKey,
  usageDayKeysBetween,
  type UsageVisitRecord,
} from "@/lib/usage/appUsage";

export const dynamic = "force-dynamic";

type DaySummary = ReturnType<typeof summarizeUsageVisits> & { day: string };

function emptySummary(day: string): DaySummary {
  return {
    day,
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

function summaryFromParent(day: string, data: Record<string, unknown> | undefined): DaySummary {
  if (!data) return emptySummary(day);
  const entries = Math.max(0, Math.floor(Number(data.entries) || 0));
  const registered = Math.max(0, Math.floor(Number(data.registered) || 0));
  return {
    day,
    entries,
    registered,
    anonymous: Math.max(0, Math.floor(Number(data.anonymous) || Math.max(0, entries - registered))),
    sessions: Math.max(0, Math.floor(Number(data.sessions) || 0)),
    totalVisibleMs: Math.max(0, Math.floor(Number(data.totalVisibleMs) || 0)),
    averageVisibleMs: Math.max(0, Math.floor(Number(data.averageVisibleMs) || 0)),
    measuredEntries: Math.max(0, Math.floor(Number(data.measuredEntries) || 0)),
    timedEntries: Math.max(0, Math.floor(Number(data.timedEntries) || 0)),
  };
}

function cleanUsername(value: unknown) {
  return String(value || "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 80);
}

async function keepRealProfiles(
  db: {
    collection: (name: string) => { doc: (id: string) => unknown };
    getAll: (...refs: unknown[]) => Promise<Array<{ id: string; exists: boolean; data: () => Record<string, unknown> }>>;
  },
  visits: UsageVisitRecord[],
) {
  const missing = [
    ...new Set(
      visits.filter((visit) => visit.kind === "registered" && !visit.username).map((visit) => visit.uid),
    ),
  ];
  const names = new Map<string, string>();
  const profiles = new Set<string>();
  for (let index = 0; index < missing.length; index += 100) {
    const chunk = missing.slice(index, index + 100);
    const snaps = await db.getAll(...chunk.map((uid) => db.collection("usuarios").doc(uid)));
    for (const snap of snaps) {
      if (!snap.exists) continue;
      profiles.add(snap.id);
      const data = snap.data() || {};
      const username = cleanUsername(data.username || data.nombre);
      if (username) names.set(snap.id, username);
    }
  }

  const seen = new Set<string>();
  const kept: UsageVisitRecord[] = [];
  for (const visit of visits) {
    if (seen.has(visit.actorKey)) continue;
    seen.add(visit.actorKey);
    if (visit.kind !== "registered") {
      kept.push(visit);
      continue;
    }
    const username = visit.username || names.get(visit.uid) || "";
    if (!username && !profiles.has(visit.uid)) continue;
    kept.push({ ...visit, username });
  }
  return kept;
}

async function loadVisits(db: {
  collection: (name: string) => {
    doc: (id: string) => {
      collection: (name: string) => {
        limit: (n: number) => {
          get: () => Promise<{ docs: Array<{ data: () => Record<string, unknown> }> }>;
        };
      };
    };
  };
}, day: string) {
  const snap = await db.collection(USAGE_COLLECTION).doc(day).collection("visits").limit(2000).get();
  const visits: UsageVisitRecord[] = [];
  for (const doc of snap.docs) {
    const visit = readUsageVisit(doc.data());
    if (visit) visits.push(visit);
  }
  return visits;
}

export async function GET(req: Request) {
  try {
    await verifyAdminIdToken(req);
    const url = new URL(req.url);
    const today = usageDayKey();
    const requested = String(url.searchParams.get("day") || today);
    if (!isUsageDayKey(requested)) {
      return NextResponse.json({ ok: false, error: "invalid_day" }, { status: 400 });
    }

    const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
    const db = getRepairAdminDb();
    const parentSnap = await db.collection(USAGE_COLLECTION).get();
    const parents = new Map<string, DaySummary>();
    for (const doc of parentSnap.docs as Array<{ id: string; data: () => Record<string, unknown> }>) {
      if (!isUsageDayKey(doc.id)) continue;
      parents.set(doc.id, summaryFromParent(doc.id, doc.data()));
    }

    const floor = shiftUsageDayKey(today, -500);
    const known = [...parents.keys()].filter((day) => day >= floor && day <= today).sort();
    const start = known[0] || today;
    const range = usageDayKeysBetween(start, today);
    const selectedDay = range.includes(requested) ? requested : today;

    const [selectedRaw, todayRaw] = await Promise.all([
      loadVisits(db, selectedDay),
      selectedDay === today ? Promise.resolve(null) : loadVisits(db, today),
    ]);
    const selectedVisits = await keepRealProfiles(db, selectedRaw);
    const todayVisits = todayRaw ? await keepRealProfiles(db, todayRaw) : null;
    const recounted = new Map<string, DaySummary>([
      [selectedDay, { day: selectedDay, ...summarizeUsageVisits(selectedVisits) }],
    ]);
    if (todayVisits) {
      recounted.set(today, { day: today, ...summarizeUsageVisits(todayVisits) });
    }

    const days = range.map((day) => recounted.get(day) || parents.get(day) || emptySummary(day));
    const summary = recounted.get(selectedDay) || emptySummary(selectedDay);
    const people = selectedVisits
      .filter((visit) => visit.kind === "registered")
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
      .map((visit) => ({
        username: visit.username,
        enteredAt: visit.enteredAt,
        lastSeenAt: visit.lastSeenAt,
        visibleMs: visit.visibleMs,
        sessions: visit.sessions,
        measured: visit.measured || visit.visibleMs > 0,
      }));

    return NextResponse.json({
      ok: true,
      timezone: "America/Argentina/Buenos_Aires",
      today,
      selectedDay,
      generatedAt: new Date().toISOString(),
      summary,
      people,
      days,
    });
  } catch (error: unknown) {
    const status = Number((error as { status?: number })?.status || 500);
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json(
      { ok: false, error: message },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
