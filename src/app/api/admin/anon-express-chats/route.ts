import { NextResponse } from "next/server";

import { handleAdminAnonExpressChatsGet } from "@/lib/admin/anonExpressChatsRoute";
import { mapAdminAuthFailure, verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";

export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
};

export async function GET(req: Request) {
  try {
    await verifyAdminIdToken(req);
  } catch (error) {
    const mapped = mapAdminAuthFailure(error);
    return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status, headers: NO_STORE_HEADERS });
  }

  try {
    const result = await handleAdminAnonExpressChatsGet(req);
    return NextResponse.json(result.body, { status: result.status, headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("admin_anon_express_chats_failed", String((error as Error)?.message || ""));
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
