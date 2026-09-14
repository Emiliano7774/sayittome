import { NextResponse } from "next/server";

import { reportAnonDirectChat } from "@/lib/anonMatch/service";
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
    rejectSpoofedUid(body?.reporterUid, caller.uid);

    const chatId = String(body?.chatId || "").trim();
    const reporterUid = resolveAnonMatchRegisteredUid(caller);
    const reporterId = caller.isAnonymous
      ? await assertAnonMatchAliasForCaller(caller, body?.reporterId ?? body?.anonId)
      : reporterUid;

    if (!chatId || !reporterId) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }

    await reportAnonDirectChat({
      chatId,
      reporterId,
      reporterUid: reporterUid || undefined,
      detalle: String(body?.detalle || ""),
    });

    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (e: unknown) {
    const status = Number((e as { status?: number })?.status || 0);
    if (status === 401 || status === 403) return authError(e);
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
