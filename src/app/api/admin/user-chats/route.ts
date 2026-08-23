import { NextResponse } from "next/server";

import { mapAdminAuthFailure } from "@/lib/admin/verifyAdminRequest";
import { handleAdminUserChatsGet } from "@/lib/admin/userChatsRoute";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const result = await handleAdminUserChatsGet(req);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    // Never mask datastore/logic failures as unauthorized.
    const mapped = mapAdminAuthFailure(error);
    return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
  }
}
