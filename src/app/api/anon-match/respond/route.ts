import { NextResponse } from "next/server";

import { respondAnonMatchRequest } from "@/lib/anonMatch/service";
import {
  assertAnonMatchAliasForCaller,
  rejectSpoofedUid,
  resolveAnonMatchRegisteredUid,
  verifyAnonMatchCaller,
} from "@/lib/anonMatch/verifyAnonMatchCaller";

export const dynamic = "force-dynamic";

function authError(error: unknown) {
  const status = Number((error as { status?: number })?.status || 401);
  const message = String((error as Error)?.message || "unauthorized");
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const caller = await verifyAnonMatchCaller(req);
    const body = await req.json().catch(() => ({}));
    rejectSpoofedUid(body?.responderUid ?? body?.uid, caller.uid);

    const solicitudId = String(body?.solicitudId || "").trim();
    const accept = body?.accept === true;
    const responderUid = resolveAnonMatchRegisteredUid(caller) || undefined;
    const responderAnonId = caller.isAnonymous
      ? await assertAnonMatchAliasForCaller(
          caller,
          body?.anonId ?? body?.responderAnonId,
        )
      : undefined;

    if (!solicitudId) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }

    const result = await respondAnonMatchRequest({
      solicitudId,
      responderAnonId,
      responderUid,
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
    const status = Number((e as { status?: number })?.status || 0);
    if (status === 401 || status === 403) return authError(e);
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
