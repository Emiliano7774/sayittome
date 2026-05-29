import { NextResponse } from "next/server";

import { closeAnonDirectChat } from "@/lib/anonMatch/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const chatId = String(body?.chatId || "").trim();
    const closedBy = String(body?.closedBy || "").trim();

    if (!chatId || !closedBy) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }

    await closeAnonDirectChat({ chatId, closedBy });

    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
