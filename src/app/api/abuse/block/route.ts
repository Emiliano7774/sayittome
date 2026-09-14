import { NextResponse } from "next/server";

import { verifyFirebaseIdToken } from "@/lib/admin/verifyAdminRequest";
import { applyProfileAnonAbuseBlock } from "@/lib/abuse/profileAnonAbuseBlockWrite";
import { redactAbuseBlockForClient } from "@/lib/abuse/profileAnonAbuseBlock";

export const dynamic = "force-dynamic";

/**
 * Profile owner → block anon visitor for exactly 30 minutes (server clock).
 * Body may only supply chatId + optional motivo. Identity/IP/duration derived server-side.
 * Blocks the verified thread/anon even when IP coverage is still pending.
 */
export async function POST(req: Request) {
  let authUid = "";
  try {
    const user = await verifyFirebaseIdToken(req);
    authUid = user.uid;
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return NextResponse.json(
      { ok: false, error: String((error as Error)?.message || "unauthorized") },
      { status },
    );
  }

  let body: { chatId?: string; motivo?: string };
  try {
    body = (await req.json()) as { chatId?: string; motivo?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Ignore any client-supplied receptorUid / visitorId / IP / durationMinutes.
  const result = await applyProfileAnonAbuseBlock({
    authUid,
    chatId: String(body.chatId || "").trim(),
    motivo: String(body.motivo || "bloqueo_30m"),
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    replayed: result.replayed,
    ipCoverage: result.ipCoverage,
    block: redactAbuseBlockForClient(result.block),
  });
}
