import { NextResponse } from "next/server";

import { createFirestoreDoc } from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const tipo = String(body?.tipo || body?.motivo || "perfil");
    const detalle = String(body?.detalle || "").trim();
    const evidenceUrl = String(body?.evidenceUrl || "").trim();

    if (!detalle) {
      return NextResponse.json({ ok: false, error: "detail_required" }, { status: 400 });
    }

    if (tipo === "perfil_falso" && !evidenceUrl) {
      return NextResponse.json({ ok: false, error: "evidence_required" }, { status: 400 });
    }

    const report = await createFirestoreDoc("reportes", {
      tipo,
      motivo: String(body?.motivo || tipo),
      detalle,
      links: String(body?.links || ""),
      evidenceUrl,
      targetUid: String(body?.targetUid || ""),
      targetUsername: String(body?.targetUsername || ""),
      storyId: String(body?.storyId || ""),
      reporterUid: String(body?.reporterUid || ""),
      reporterEmail: String(body?.reporterEmail || ""),
      chatId: String(body?.chatId || ""),
      estado: "pendiente",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, report, ts: Date.now() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
