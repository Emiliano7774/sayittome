import { NextResponse } from "next/server";

import { verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";
import {
  USAGE_COLLECTION,
  isUsageDayKey,
  readUsageVisit,
  recentUsageDayKeys,
  summarizeUsageVisits,
  usageDayKey,
  type UsageVisitRecord,
} from "@/lib/usage/appUsage";

export const dynamic = "force-dynamic";

async function loadVisits(
  db: {
    collection: (name: string) => {
      doc: (id: string) => {
        collection: (name: string) => {
          limit: (n: number) => {
            get: () => Promise<{
              docs: Array<{ data: () => Record<string, unknown> }>;
            }>;
          };
        };
      };
    };
  },
  day: string,
) {
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
    const days = recentUsageDayKeys(today);
    const selectedDay = days.includes(requested) ? requested : today;

    const loaded = await Promise.all(
      days.map(async (day) => {
        const visits = await loadVisits(db, day);
        return { day, visits };
      }),
    );

    const selected = loaded.find((row) => row.day === selectedDay) || loaded[loaded.length - 1];
    const people = selected.visits
      .filter((visit) => visit.kind === "registered")
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
      .map((visit) => ({
        username: visit.username,
        enteredAt: visit.enteredAt,
        lastSeenAt: visit.lastSeenAt,
        visibleMs: visit.visibleMs,
        sessions: visit.sessions,
      }));

    return NextResponse.json({
      ok: true,
      timezone: "America/Argentina/Buenos_Aires",
      today,
      selectedDay,
      summary: summarizeUsageVisits(selected.visits),
      people,
      days: loaded.map((row) => ({
        day: row.day,
        ...summarizeUsageVisits(row.visits),
      })),
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
