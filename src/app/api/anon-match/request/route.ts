import { NextResponse } from "next/server";

import {
  countAvailableMatchTargets,
  createAnonMatchRequest,
  cancelAnonMatchRequest,
  expireAnonMatchRequestIfNeeded,
  getAnonMatchRequest,
} from "@/lib/anonMatch/service";
import { findFreshestAvailableAnonTarget } from "@/lib/anonMatch/matchPool";
import { assertCallerOwnsAnonMatchSolicitud } from "@/lib/anonMatch/anonMatchSolicitudAuth";
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

export async function GET(req: Request) {
  try {
    await verifyAnonMatchCaller(req);
    const { searchParams } = new URL(req.url);
    const excludeRaw = String(searchParams.get("exclude") || "").trim();
    const excludeAnonIds = excludeRaw ? excludeRaw.split("|").filter(Boolean) : [];
    const excludeUidRaw = String(searchParams.get("excludeUid") || "").trim();
    const excludeUids = excludeUidRaw ? excludeUidRaw.split("|").filter(Boolean) : [];
    const seenAfterMs = Number(searchParams.get("seenAfterMs") || 0) || 0;

    const [available, freshest] = await Promise.all([
      countAvailableMatchTargets({ excludeAnonIds, excludeUids }),
      findFreshestAvailableAnonTarget({
        excludeAnonIds,
        excludeUids,
        seenAfterMs: seenAfterMs > 0 ? seenAfterMs : undefined,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      available,
      freshestAnonId: freshest?.id || "",
      freshestLastSeenMs: freshest?.lastSeenMs || 0,
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const status = Number((e as { status?: number })?.status || 0);
    if (status === 401 || status === 403) return authError(e);
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message, available: 0 }, { status: 200 });
  }
}
export async function POST(req: Request) {
  try {
    const caller = await verifyAnonMatchCaller(req);
    const body = await req.json().catch(() => ({}));
    rejectSpoofedUid(body?.solicitanteUid, caller.uid);

    const solicitanteUid = resolveAnonMatchRegisteredUid(caller);
    const solicitanteAnonId = caller.isAnonymous
      ? await assertAnonMatchAliasForCaller(caller, body?.solicitanteAnonId)
      : String(body?.solicitanteAnonId || "").trim();
    const localAnonId = caller.isAnonymous
      ? solicitanteAnonId
      : String(body?.localAnonId || "").trim();

    if (!solicitanteAnonId && caller.isAnonymous) {
      return NextResponse.json({ ok: false, error: "missing_solicitant_anon" }, { status: 400 });
    }

    const excludeRaw = String(body?.excludeAnonIds || body?.exclude || "").trim();
    const excludeAnonIds = Array.isArray(body?.excludeAnonIds)
      ? body.excludeAnonIds.map(String)
      : excludeRaw
        ? excludeRaw.split("|").filter(Boolean)
        : [];
    const excludeUidRaw = String(body?.excludeUids || body?.excludeUid || "").trim();
    const excludeUids = Array.isArray(body?.excludeUids)
      ? body.excludeUids.map(String)
      : excludeUidRaw
        ? excludeUidRaw.split("|").filter(Boolean)
        : [solicitanteUid];
    const recentTargetIds = Array.isArray(body?.recentTargetIds)
      ? body.recentTargetIds.map(String).filter(Boolean)
      : String(body?.recentTargetIds || "")
          .split("|")
          .map((id: string) => id.trim())
          .filter(Boolean);

    // A deliberate visitor click may target that live anon, but cannot bypass
    // the server's authenticated alias, presence, block or availability checks.
    const targetAnonId = String(body?.targetAnonId || "").trim();
    if (targetAnonId && !/^anon_[a-z0-9_]{6,80}$/i.test(targetAnonId)) {
      return NextResponse.json({ ok: false, error: "invalid_target_anon" }, { status: 400 });
    }
    const result = await createAnonMatchRequest({
      targetAnonId: targetAnonId || undefined,
      solicitanteUid,
      solicitanteAnonId: solicitanteAnonId || undefined,
      solicitanteAuthUid: caller.uid,
      localAnonId: localAnonId || undefined,
      excludeAnonIds,
      excludeUids,
      recentTargetIds,
      pais:
        String(body?.pais || "").trim().toUpperCase() ||
        String(req.headers.get("cf-ipcountry") || req.headers.get("x-country-code") || "")
          .trim()
          .toUpperCase(),
      provincia: String(body?.provincia || "").trim(),
      verPaises: Array.isArray(body?.verPaises) ? body.verPaises.map(String) : [],
      verProvincias: Array.isArray(body?.verProvincias) ? body.verProvincias.map(String) : [],
      idioma: String(body?.idioma || "es").trim(),
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason, ts: Date.now() });
    }

    return NextResponse.json({
      ok: true,
      solicitudId: result.solicitudId,
      anonId: result.anonId,
      destinatarioUid: result.destinatarioUid,
      destinatarioTipo: result.destinatarioTipo,
      expiresAt: result.expiresAt,
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const status = Number((e as { status?: number })?.status || 0);
    if (status === 401 || status === 403) return authError(e);
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const caller = await verifyAnonMatchCaller(req);
    const body = await req.json().catch(() => ({}));
    const solicitudId = String(body?.solicitudId || "").trim();
    if (!solicitudId) {
      return NextResponse.json({ ok: false, error: "missing_solicitud" }, { status: 400 });
    }

    const row = await getAnonMatchRequest(solicitudId);
    if (!row) {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }

    await assertCallerOwnsAnonMatchSolicitud(caller, row);

    if (body?.cancel === true) {
      const cancelled = await cancelAnonMatchRequest(solicitudId);
      if (!cancelled.ok) {
        return NextResponse.json({
          ok: false,
          reason: cancelled.reason,
          estado: "estado" in cancelled ? cancelled.estado : "",
          ts: Date.now(),
        });
      }
      return NextResponse.json({
        ok: true,
        solicitudId,
        estado: "cancelado",
        chatId: "",
        anonId: String(row.anonId || ""),
        ts: Date.now(),
      });
    }

    const estado = await expireAnonMatchRequestIfNeeded(row);
    const fresh =
      String(row.estado || "") === estado
        ? row
        : (await getAnonMatchRequest(solicitudId)) || row;

    return NextResponse.json({
      ok: true,
      solicitudId,
      estado,
      chatId: String(fresh.chatId || ""),
      anonId: String(fresh.anonId || ""),
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const status = Number((e as { status?: number })?.status || 0);
    if (status === 401 || status === 403) return authError(e);
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
