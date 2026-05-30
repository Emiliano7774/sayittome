import { NextResponse } from "next/server";

import { respondAnonMatchRequest } from "@/lib/anonMatch/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const solicitudId = String(body?.solicitudId || "").trim();
    const responderAnonId = String(body?.anonId || body?.responderAnonId || "").trim();
    const responderUid = String(body?.responderUid || body?.uid || "").trim();
    const accept = body?.accept === true;

    if (!solicitudId || (!responderAnonId && !responderUid)) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }

    const result = await respondAnonMatchRequest({
      solicitudId,
      responderAnonId: responderAnonId || undefined,
      responderUid: responderUid || undefined,
      accept,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason, ts: Date.now() });
    }

    return NextResponse.json({
      ok: true,
      estado: result.estado,
      chatId: "chatId" in result ? result.chatId : "",
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
