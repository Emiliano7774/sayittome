import { NextResponse } from "next/server";

import { listIncomingAnonMatchRequests } from "@/lib/anonMatch/service";
import {
  assertAnonMatchAliasForCaller,
  lookupActiveAnonMatchAliasForAuth,
  verifyAnonMatchCaller,
} from "@/lib/anonMatch/verifyAnonMatchCaller";

export const dynamic = "force-dynamic";

function authError(error: unknown) {
  const status = Number((error as { status?: number })?.status || 401);
  const message = String((error as Error)?.message || "unauthorized");
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * Pending incoming match requests for the authenticated caller.
 * Admin-backed so clients are not blocked by Firestore list rules.
 */
export async function GET(req: Request) {
  try {
    const caller = await verifyAnonMatchCaller(req);
    const { searchParams } = new URL(req.url);
    const claimedAnon = String(searchParams.get("anonId") || "").trim();

    let callerAnonId = "";
    if (caller.isAnonymous) {
      callerAnonId = claimedAnon
        ? await assertAnonMatchAliasForCaller(caller, claimedAnon)
        : (await lookupActiveAnonMatchAliasForAuth(caller.uid)) || "";
    }

    const incoming = await listIncomingAnonMatchRequests({
      callerAuthUid: caller.uid,
      callerIsAnonymous: caller.isAnonymous,
      callerAnonId: callerAnonId || undefined,
    });

    return NextResponse.json({
      ok: true,
      incoming,
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const status = Number((e as { status?: number })?.status || 0);
    if (status === 401 || status === 403) return authError(e);
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message, incoming: [] }, { status: 200 });
  }
}
