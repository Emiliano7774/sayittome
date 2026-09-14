import { NextResponse } from "next/server";

import { handleAdminAnonExpressChatsGet } from "@/lib/admin/anonExpressChatsRoute";
import { mapAdminAuthFailure, verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await verifyAdminIdToken(req);
  } catch (error) {
    const mapped = mapAdminAuthFailure(error);
    return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
  }

  try {
    const result = await handleAdminAnonExpressChatsGet(req);
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("admin_anon_express_chats_failed", String((error as Error)?.message || ""));
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
