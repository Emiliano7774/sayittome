import { NextResponse } from "next/server";

import {
  getAnonMatchAdminDoc,
  setAnonMatchAdminDoc,
} from "@/lib/anonMatch/anonMatchAdminStore";
import {
  ANON_MATCH_DND_MAX_MINUTES,
  ANON_MATCH_DND_MIN_MINUTES,
  normalizeAnonMatchDndMinutes,
} from "@/lib/anonMatch/doNotDisturb";
import { invalidateAnonMatchAvailabilityCache } from "@/lib/anonMatch/matchPool";
import {
  assertAnonMatchAliasForCaller,
  resolveAnonMatchRegisteredUid,
  verifyAnonMatchCaller,
} from "@/lib/anonMatch/verifyAnonMatchCaller";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function authError(error: unknown) {
  const status = Number((error as { status?: number })?.status || 401);
  const message = String((error as Error)?.message || "unauthorized");
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * POST { minutes } — pause incoming anon-match targeting for N minutes.
 * Anonymous → anonimos_activos[alias].doNotDisturbUntil
 * Registered → usuarios[uid].anonMatchDoNotDisturbUntil
 */
export async function POST(req: Request) {
  try {
    const caller = await verifyAnonMatchCaller(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const minutes = normalizeAnonMatchDndMinutes(body?.minutes);
    if (minutes == null) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_minutes",
          min: ANON_MATCH_DND_MIN_MINUTES,
          max: ANON_MATCH_DND_MAX_MINUTES,
        },
        { status: 400 },
      );
    }

    const until = new Date(Date.now() + minutes * 60_000).toISOString();
    const now = new Date().toISOString();

    if (caller.isAnonymous) {
      const anonId = await assertAnonMatchAliasForCaller(caller, body?.anonId);
      const existing = await getAnonMatchAdminDoc("anonimos_activos", anonId);
      await setAnonMatchAdminDoc("anonimos_activos", anonId, {
        ...(existing || {}),
        anonId,
        authUid: caller.uid,
        doNotDisturbUntil: until,
        disponibleParaChat: false,
        updatedAt: now,
        source: "anon_match_presence",
      });
    } else {
      const uid = resolveAnonMatchRegisteredUid(caller);
      if (!uid) {
        return NextResponse.json({ ok: false, error: "missing_uid" }, { status: 400 });
      }
      await setAnonMatchAdminDoc("usuarios", uid, {
        anonMatchDoNotDisturbUntil: until,
        updatedAt: now,
      });
    }

    invalidateAnonMatchAvailabilityCache();

    return NextResponse.json({
      ok: true,
      minutes,
      doNotDisturbUntil: until,
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const status = Number((e as { status?: number })?.status || 0);
    if (status === 401 || status === 403) return authError(e);
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: status || 500 });
  }
}
