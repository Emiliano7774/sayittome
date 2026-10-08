import { NextResponse } from "next/server";

import { verifyFirebaseIdTokenAllowingAnonymous } from "@/lib/admin/verifyAdminRequest";
import { findActiveProfileAnonAbuseForRequest } from "@/lib/abuse/profileAnonAbuseBlockWrite";

export const dynamic = "force-dynamic";

const ABUSE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Surrogate-Control": "no-store",
  Pragma: "no-cache",
};

function abuseJson(body: Record<string, unknown>, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status,
    headers: ABUSE_NO_STORE_HEADERS,
  });
}

/**
 * UI-only block probe. Does NOT stamp IP or create leases.
 * Authorization for send is issue-send-permit + Rules.
 */
export async function POST(req: Request) {
  try {
    await verifyFirebaseIdTokenAllowingAnonymous(req);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return abuseJson(
      { ok: false, error: String((error as Error)?.message || "unauthorized") },
      { status },
    );
  }

  try {
    let body: { receptorUid?: string; chatId?: string };
    try {
      body = (await req.json()) as { receptorUid?: string; chatId?: string };
    } catch {
      return abuseJson({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const receptorUid = String(body.receptorUid || "").trim();
    const chatId = String(body.chatId || "").trim();
    if (!receptorUid) {
      return abuseJson({ ok: false, error: "missing_receptor" }, { status: 400 });
    }

    const hit = await findActiveProfileAnonAbuseForRequest({
      receptorUid,
      chatId,
      req,
    });

    return abuseJson({
      ok: true,
      blocked: hit.blocked,
      reason: hit.blocked ? "blocked" : "",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return abuseJson({ ok: false, error: message }, { status: 500 });
  }
}
