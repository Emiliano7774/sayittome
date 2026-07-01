import { NextResponse } from "next/server";

import { buildUserGenderRatio } from "@/lib/admin/userGenderRatio";
import { assertAdminEmail, getAdminEmailFromRequest } from "@/lib/admin/isAdmin";
import { runCollectionQueryAll } from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const adminEmail = getAdminEmailFromRequest(req);
    assertAdminEmail(adminEmail);

    const users = await runCollectionQueryAll("usuarios", "createdAt", "DESCENDING");
    const summary = buildUserGenderRatio(users);

    return NextResponse.json({
      ok: true,
      summary,
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    const status = message === "forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
