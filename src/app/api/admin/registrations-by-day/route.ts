import { NextResponse } from "next/server";

import { buildUserRegistrationsByDay } from "@/lib/admin/userRegistrationsByDay";
import { assertAdminEmail, getAdminEmailFromRequest } from "@/lib/admin/isAdmin";
import { runCollectionQueryAllByDocumentId } from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

type AdminDocumentSnapshot = {
  id: string;
  data: () => Record<string, unknown>;
  createTime?: { toDate?: () => Date };
};

export async function GET(req: Request) {
  try {
    const adminEmail = getAdminEmailFromRequest(req);
    assertAdminEmail(adminEmail);

    let users: Record<string, unknown>[];

    try {
      const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
      const snap = await getRepairAdminDb().collection("usuarios").get();
      users = snap.docs.map((doc: AdminDocumentSnapshot) => ({
        ...doc.data(),
        id: doc.id,
        _firestoreCreateTime: doc.createTime?.toDate?.()?.toISOString?.() || "",
      })) as Record<string, unknown>[];
    } catch (error) {
      if ((error as Error)?.message !== "admin_sdk_unavailable") throw error;
      users = await runCollectionQueryAllByDocumentId("usuarios");
    }

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
