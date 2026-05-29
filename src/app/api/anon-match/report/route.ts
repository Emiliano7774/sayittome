import { NextResponse } from "next/server";

import { reportAnonDirectChat } from "@/lib/anonMatch/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const chatId = String(body?.chatId || "").trim();
    const reporterId = String(body?.reporterId || "").trim();
    const reporterUid = String(body?.reporterUid || "").trim();

    if (!chatId || !reporterId) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }

    await reportAnonDirectChat({
      chatId,
      reporterId,
      reporterUid,
      detalle: String(body?.detalle || ""),
    });

    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
