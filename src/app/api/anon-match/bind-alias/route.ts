import { NextResponse } from "next/server";

import { issueServerAnonMatchAlias } from "@/lib/anonMatch/anonMatchAliasAdmin";
import { verifyAnonMatchCaller } from "@/lib/anonMatch/verifyAnonMatchCaller";

export const dynamic = "force-dynamic";

function authError(error: unknown) {
  const status = Number((error as { status?: number })?.status || 401);
  const message = String((error as Error)?.message || "unauthorized");
  return NextResponse.json({ ok: false, error: message }, { status });
}

function clientAliasForbidden(body: Record<string, unknown>) {
  const forbiddenKeys = [
    "anonId",
    "solicitanteAnonId",
    "responderAnonId",
    "reporterId",
    "closedBy",
  ];
  return forbiddenKeys.some((key) => String(body?.[key] || "").trim());
}

/**
 * Server-issued anon-match alias — client must not choose anonId.
 * Idempotent for the same auth.uid unless rotate=true.
 */
export async function POST(req: Request) {
  try {
    const caller = await verifyAnonMatchCaller(req);
    if (!caller.isAnonymous) {
      return NextResponse.json({ ok: false, error: "profile_cannot_bind_anon" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (clientAliasForbidden(body)) {
      return NextResponse.json({ ok: false, error: "client_alias_forbidden" }, { status: 400 });
    }

    const rotate = body?.rotate === true;
    const issued = await issueServerAnonMatchAlias({
      authUid: caller.uid,
      rotate,
    });

    return NextResponse.json({
      ok: true,
      anonId: issued.anonId,
      bound: true,
      created: issued.created,
      rotated: issued.rotated,
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const status = Number((e as { status?: number })?.status || 0);
    if (status === 401 || status === 403) return authError(e);
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: status || 500 });
  }
}
