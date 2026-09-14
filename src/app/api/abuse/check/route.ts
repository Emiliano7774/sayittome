import { NextResponse } from "next/server";

import { verifyFirebaseIdTokenAllowingAnonymous } from "@/lib/admin/verifyAdminRequest";
import { findActiveProfileAnonAbuseForRequest } from "@/lib/abuse/profileAnonAbuseBlockWrite";

export const dynamic = "force-dynamic";

/**
 * UI-only block probe. Does NOT stamp IP or create leases.
 * Authorization for send is issue-send-permit + Rules.
 */
export async function POST(req: Request) {
  try {
    await verifyFirebaseIdTokenAllowingAnonymous(req);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return NextResponse.json(
      { ok: false, error: String((error as Error)?.message || "unauthorized") },
      { status },
    );
  }

  try {
    let body: { receptorUid?: string; chatId?: string };
    try {
      body = (await req.json()) as { receptorUid?: string; chatId?: string };
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const receptorUid = String(body.receptorUid || "").trim();
    const chatId = String(body.chatId || "").trim();
    if (!receptorUid) {
      return NextResponse.json({ ok: false, error: "missing_receptor" }, { status: 400 });
    }

    const hit = await findActiveProfileAnonAbuseForRequest({
      receptorUid,
      chatId,
      req,
    });

    return NextResponse.json({
      ok: true,
      blocked: hit.blocked,
      reason: hit.blocked ? "blocked" : "",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
