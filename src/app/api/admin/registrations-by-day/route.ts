import { NextResponse } from "next/server";

import { buildUserRegistrationsByDay } from "@/lib/admin/userRegistrationsByDay";
import { assertAdminEmail, getAdminEmailFromRequest } from "@/lib/admin/isAdmin";
import { getCachedAdminUsers } from "@/lib/admin/cachedAdminUsers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const adminEmail = getAdminEmailFromRequest(req);
    assertAdminEmail(adminEmail);

    const users = await getCachedAdminUsers();

    const registeredTotal = new Set(
      users
        .map((user) => String(user.uid || user.id || "").trim())
        .filter(Boolean),
    ).size;

    const days = buildUserRegistrationsByDay(users);
    const today = days.find((day) => day.label === "Hoy") || null;

    return NextResponse.json({
      ok: true,
      days,
      summary: {
        todayCount: today?.count ?? 0,
        todayDelta: today?.deltaVsPreviousDay ?? null,
        registeredTotal,
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
