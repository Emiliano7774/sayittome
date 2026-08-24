import { NextResponse } from "next/server";

import { mapAdminUserChatsFailure } from "@/lib/admin/adminUsernameParam";
import { handleAdminUserChatsGet } from "@/lib/admin/userChatsRoute";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const result = await handleAdminUserChatsGet(req);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    // Unexpected throw — keep real code; never collapse to auth "unauthorized".
    const mapped = mapAdminUserChatsFailure(error);
    console.error("admin_user_chats_route_unhandled", {
      status: mapped.status,
      error: mapped.error,
    });
    return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
  }
}
