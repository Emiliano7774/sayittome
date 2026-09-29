import { NextResponse } from "next/server";

import {
  decideAnonymousPresenceWrite,
  decideLegacyAnonPresenceCleanup,
  ANON_PRESENCE_ACTIVE_MS,
} from "@/lib/anonMatch/anonymousPresenceIdentity";
import {
  lookupActiveAnonMatchAliasForAuth,
  lookupAnonMatchAliasBinding,
} from "@/lib/anonMatch/anonMatchAliasAdmin";
import {
  deleteAnonMatchAdminDoc,
  setAnonMatchAdminDoc,
} from "@/lib/anonMatch/anonMatchAdminStore";
import { verifyAnonMatchCaller } from "@/lib/anonMatch/verifyAnonMatchCaller";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function authError(error: unknown) {
  const status = Number((error as { status?: number })?.status || 401);
  const message = String((error as Error)?.message || "unauthorized");
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function writePresenceDoc(anonId: string, authUid: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ANON_PRESENCE_ACTIVE_MS);
  await setAnonMatchAdminDoc("anonimos_activos", anonId, {
    anonId,
    authUid,
    lastSeenAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    disponibleParaChat: true,
    enChat: false,
    source: "anon_match_presence",
  });
}

async function deletePresenceDoc(anonId: string) {
  try {
    await deleteAnonMatchAdminDoc("anonimos_activos", anonId);
  } catch (error) {
    const code = String((error as { code?: string | number })?.code || "");
    const message = String((error as Error)?.message || "");
    if (code === "5" || /not.?found|NOT_FOUND/i.test(message)) return;
    throw error;
  }
}

/**
 * Publish / refresh anonimos_activos under the caller's server-issued match alias.
 * Body anonId is optional and must match the bound alias when present — never trusted alone.
 */
export async function POST(req: Request) {
  try {
    const caller = await verifyAnonMatchCaller(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!caller.isAnonymous) {
      return NextResponse.json(
        { ok: false, error: "profile_cannot_publish_anon_presence" },
        { status: 403 },
      );
    }

    const bound =
      (await lookupActiveAnonMatchAliasForAuth(caller.uid)) ||
      "";
    const decision = decideAnonymousPresenceWrite({
      callerIsAnonymous: true,
      boundServerAlias: bound,
      claimedAnonId: String(body?.anonId || "").trim() || undefined,
    });
    if (!decision.ok) {
      const status =
        decision.reason === "alias_spoof" ||
        decision.reason === "profile_cannot_publish_anon_presence"
          ? 403
          : 400;
      return NextResponse.json({ ok: false, error: decision.reason }, { status });
    }

    await writePresenceDoc(decision.anonId, caller.uid);

    const legacyLocal = String(body?.legacyLocalAnonId || "").trim();
    let legacyCleaned: string | null = null;
    if (legacyLocal && legacyLocal !== decision.anonId) {
      const boundForLegacy = await lookupAnonMatchAliasBinding(legacyLocal);
      const cleanup = decideLegacyAnonPresenceCleanup({
        callerIsAnonymous: true,
        callerUid: caller.uid,
        legacyLocalAnonId: legacyLocal,
        boundAuthUidForLegacy: boundForLegacy,
      });
      if (cleanup.ok) {
        await deletePresenceDoc(cleanup.anonId);
        legacyCleaned = cleanup.anonId;
      }
    }

    return NextResponse.json({
      ok: true,
      anonId: decision.anonId,
      legacyCleaned,
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const status = Number((e as { status?: number })?.status || 0);
    if (status === 401 || status === 403) return authError(e);
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { ok: false, error: message, ts: Date.now() },
      { status: status || 500 },
    );
  }
}

/**
 * Remove presence for the caller's bound server alias (and optional legacy local id).
 * pagehide uses cached alias — do not require a fresh bind here.
 */
export async function DELETE(req: Request) {
  try {
    const caller = await verifyAnonMatchCaller(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!caller.isAnonymous) {
      return NextResponse.json(
        { ok: false, error: "profile_cannot_publish_anon_presence" },
        { status: 403 },
      );
    }

    const bound = (await lookupActiveAnonMatchAliasForAuth(caller.uid)) || "";
    const claimed = String(body?.anonId || "").trim();

    let anonId = "";
    if (bound) {
      const decision = decideAnonymousPresenceWrite({
        callerIsAnonymous: true,
        boundServerAlias: bound,
        claimedAnonId: claimed || undefined,
      });
      if (!decision.ok) {
        return NextResponse.json({ ok: false, error: decision.reason }, { status: 403 });
      }
      anonId = decision.anonId;
    } else if (claimed) {
      const claimedBound = await lookupAnonMatchAliasBinding(claimed);
      if (claimedBound !== caller.uid) {
        return NextResponse.json({ ok: false, error: "alias_spoof" }, { status: 403 });
      }
      anonId = claimed;
    } else {
      return NextResponse.json({ ok: false, error: "missing_server_alias" }, { status: 400 });
    }

    await deletePresenceDoc(anonId);

    const legacyLocal = String(body?.legacyLocalAnonId || "").trim();
    let legacyCleaned: string | null = null;
    if (legacyLocal && legacyLocal !== anonId) {
      const boundForLegacy = await lookupAnonMatchAliasBinding(legacyLocal);
      const cleanup = decideLegacyAnonPresenceCleanup({
        callerIsAnonymous: true,
        callerUid: caller.uid,
        legacyLocalAnonId: legacyLocal,
        boundAuthUidForLegacy: boundForLegacy,
      });
      if (cleanup.ok) {
        await deletePresenceDoc(cleanup.anonId);
        legacyCleaned = cleanup.anonId;
      }
    }

    return NextResponse.json({
      ok: true,
      anonId,
      legacyCleaned,
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const status = Number((e as { status?: number })?.status || 0);
    if (status === 401 || status === 403) return authError(e);
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { ok: false, error: message, ts: Date.now() },
      { status: status || 500 },
    );
  }
}
