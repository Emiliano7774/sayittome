import { NextResponse } from "next/server";

import { mapAdminAuthFailure, verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    await verifyAdminIdToken(req);
  } catch (error) {
    const mapped = mapAdminAuthFailure(error);
    return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
  }

  try {
    const { buildAuthoritativeAdminChatsFeed } = await import(
      "@/lib/moderation/adminChatsFeed"
    );
    const feed = await buildAuthoritativeAdminChatsFeed();
    return NextResponse.json(feed, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || "chats_feed_failed");
    const status = Number((error as { status?: number })?.status || 503);
    console.error("admin_chats_feed_failed", { message, status });
    return NextResponse.json(
      { ok: false, error: message === "admin_project_mismatch" ? message : "chats_feed_unavailable" },
      { status: status === 503 ? 503 : 500 },
    );
  }
}
