import { NextResponse } from "next/server";

import { buildUserRegistrationsByDay } from "@/lib/admin/userRegistrationsByDay";
import { assertAdminEmail, getAdminEmailFromRequest } from "@/lib/admin/isAdmin";
import { runCollectionQueryAll } from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const adminEmail = getAdminEmailFromRequest(req);
    assertAdminEmail(adminEmail);

    const users = await runCollectionQueryAll("usuarios", "createdAt", "DESCENDING");
    const days = buildUserRegistrationsByDay(users);
    const today = days[0] || null;

    return NextResponse.json({
      ok: true,
      days,
      summary: {
        todayCount: today?.count ?? 0,
        todayDelta: today?.deltaVsPreviousDay ?? null,
        totalWithDate: days.reduce((sum, day) => sum + day.count, 0),
        daysTracked: days.length,
      },
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    const status = message === "forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
