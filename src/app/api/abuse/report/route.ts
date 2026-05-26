import { NextResponse } from "next/server";

import { createFirestoreDoc } from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const report = await createFirestoreDoc("reportes", {
      tipo: String(body?.tipo || "acoso"),
      motivo: String(body?.motivo || "acoso_anonimo"),
      detalle: String(body?.detalle || ""),
      targetUid: String(body?.targetUid || ""),
      targetUsername: String(body?.targetUsername || ""),
      reporterUid: String(body?.reporterUid || ""),
      reporterEmail: String(body?.reporterEmail || ""),
      chatId: String(body?.chatId || ""),
      blockedFingerprint: String(body?.blockedFingerprint || ""),
      estado: "pendiente",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, report, ts: Date.now() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
