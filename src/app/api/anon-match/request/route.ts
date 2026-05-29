import { NextResponse } from "next/server";

import {
  countAvailableAnons,
  createAnonMatchRequest,
  expireAnonMatchRequestIfNeeded,
  getAnonMatchRequest,
} from "@/lib/anonMatch/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const excludeRaw = String(searchParams.get("exclude") || "").trim();
    const exclude = excludeRaw ? excludeRaw.split("|").filter(Boolean) : [];

    const available = await countAvailableAnons(exclude);

    return NextResponse.json({ ok: true, available, ts: Date.now() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message, available: 0 }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const solicitanteUid = String(body?.solicitanteUid || "").trim();
    if (!solicitanteUid) {
      return NextResponse.json({ ok: false, error: "missing_uid" }, { status: 400 });
    }

    const excludeRaw = String(body?.excludeAnonIds || body?.exclude || "").trim();
    const excludeAnonIds = Array.isArray(body?.excludeAnonIds)
      ? body.excludeAnonIds.map(String)
      : excludeRaw
        ? excludeRaw.split("|").filter(Boolean)
        : [];

    const result = await createAnonMatchRequest({
      solicitanteUid,
      excludeAnonIds,
      pais: String(body?.pais || "").trim(),
      provincia: String(body?.provincia || "").trim(),
      idioma: String(body?.idioma || "es").trim(),
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason, ts: Date.now() });
    }

    return NextResponse.json({
      ok: true,
      solicitudId: result.solicitudId,
      anonId: result.anonId,
      expiresAt: result.expiresAt,
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const solicitudId = String(body?.solicitudId || "").trim();
    if (!solicitudId) {
      return NextResponse.json({ ok: false, error: "missing_solicitud" }, { status: 400 });
    }

    const row = await getAnonMatchRequest(solicitudId);
    if (!row) {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }

    const estado = await expireAnonMatchRequestIfNeeded(row);

    return NextResponse.json({
      ok: true,
      solicitudId,
      estado,
      chatId: String(row.chatId || ""),
      anonId: String(row.anonId || ""),
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
