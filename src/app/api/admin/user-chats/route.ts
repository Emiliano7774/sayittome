import { NextResponse } from "next/server";

import { handleAdminUserChatsGet } from "@/lib/admin/userChatsRoute";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const result = await handleAdminUserChatsGet(req);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
}
