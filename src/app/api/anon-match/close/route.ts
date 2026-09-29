import { NextResponse } from "next/server";

import { closeAnonDirectChat, getAnonDirectChatRow, userIsChatParticipant } from "@/lib/anonMatch/service";
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
    rejectSpoofedUid(body?.closedBy, caller.uid);

    const chatId = String(body?.chatId || "").trim();
    if (!chatId) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }

    const chat = await getAnonDirectChatRow(chatId);
    if (!chat) {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }

    const registeredUid = resolveAnonMatchRegisteredUid(caller);
    const anonId = caller.isAnonymous
      ? await assertAnonMatchAliasForCaller(caller, body?.closedBy)
      : "";

    if (!userIsChatParticipant(chat, registeredUid, anonId)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const closedBy = caller.isAnonymous ? anonId : registeredUid || caller.uid;
    await closeAnonDirectChat({ chatId, closedBy });

    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (e: unknown) {
    const status = Number((e as { status?: number })?.status || 0);
    if (status === 401 || status === 403) return authError(e);
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
