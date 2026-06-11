import { NextResponse } from "next/server";

import { assertAdminEmail, getAdminEmailFromRequest } from "@/lib/admin/isAdmin";
import { fetchAllModerationChatsForUser } from "@/lib/moderation/fetchUserChats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const adminEmail = getAdminEmailFromRequest(req);
    assertAdminEmail(adminEmail);

    const url = new URL(req.url);
    const username = decodeURIComponent(String(url.searchParams.get("username") || "")).trim();

    if (!username) {
      return NextResponse.json({ ok: false, error: "username required" }, { status: 400 });
    }

    const result = await fetchAllModerationChatsForUser(username);

    return NextResponse.json({
      ok: true,
      username,
      uid: result.uid,
      chats: result.chats,
      total: result.chats.length,
      scanned: result.scanned,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    const status = message === "forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
