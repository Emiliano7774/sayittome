import { NextResponse } from "next/server";

import {
  decideAnonymousPresenceWrite,
  decideLegacyAnonPresenceCleanup,
  ANON_SHUFFLE_VISIBILITY_MS,
} from "@/lib/anonMatch/anonymousPresenceIdentity";
import { isAnonMatchDoNotDisturbActive } from "@/lib/anonMatch/doNotDisturb";
import {
  lookupActiveAnonMatchAliasForAuth,
  lookupAnonMatchAliasBinding,
} from "@/lib/anonMatch/anonMatchAliasAdmin";
import {
  deleteAnonMatchAdminDoc,
  getAnonMatchAdminDoc,
  listAnonMatchAdminDocs,
  setAnonMatchAdminDoc,
} from "@/lib/anonMatch/anonMatchAdminStore";
import { invalidateAnonMatchAvailabilityCache } from "@/lib/anonMatch/matchPool";
import { normalizeGeoAudience } from "@/lib/geo/audience";
import { verifyAnonMatchCaller } from "@/lib/anonMatch/verifyAnonMatchCaller";
import { sanitizeShuffleVisitorChatId } from "@/lib/shuffle/shuffleVisitorId";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function authError(error: unknown) {
  const status = Number((error as { status?: number })?.status || 401);
  const message = String((error as Error)?.message || "unauthorized");
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function writePresenceDoc(
  anonId: string,
  authUid: string,
  geo: {
    pais: string;
    provincia: string;
    visibilidad: { paises: string[]; provincias: string[] };
  },
  chatSessionId = "",
  backgrounded = false,
) {
  const now = new Date();
  // Retention is three hours for the Shuffle card; background/foreground
  // freshness for actual contactability is checked separately by matchPool.
  const expiresAt = new Date(now.getTime() + ANON_SHUFFLE_VISIBILITY_MS);
  const existing = await getAnonMatchAdminDoc("anonimos_activos", anonId);
  const dndUntil = String((existing || {}).doNotDisturbUntil || "");
  const dndActive = isAnonMatchDoNotDisturbActive(dndUntil, now.getTime());

  await setAnonMatchAdminDoc("anonimos_activos", anonId, {
    anonId,
    authUid,
    lastSeenAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    sessionClosed: false,
    // Keep DND closed until the timer expires — heartbeats must not reopen the door.
    disponibleParaChat: dndActive ? false : true,
    enChat: false,
    ...(dndUntil ? { doNotDisturbUntil: dndUntil } : {}),
    ...(geo.pais ? { pais: geo.pais } : {}),
    ...(geo.provincia ? { provincia: geo.provincia } : {}),
    visibilidadPaises: geo.visibilidad.paises,
    visibilidadProvincias: geo.visibilidad.provincias,
    source: "anon_match_presence",
    backgrounded,
    ...(chatSessionId ? { chatSessionId } : {}),
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
    // Heartbeats must target the auth-bound alias. A stale body claim (rotated
    // alias still in sessionStorage) must not reject the write — that dropped
    // open anonymous tabs from Shuffle / "en línea".
    const decision = decideAnonymousPresenceWrite({
      callerIsAnonymous: true,
      boundServerAlias: bound,
    });
    if (!decision.ok) {
      const status =
        decision.reason === "alias_spoof" ||
        decision.reason === "profile_cannot_publish_anon_presence"
          ? 403
          : 400;
      return NextResponse.json({ ok: false, error: decision.reason }, { status });
    }

    // Anons have no profile, so their country comes from the edge header unless
    // the client states one; without it no country filter can ever reach them.
    const headerCountry = String(
      req.headers.get("cf-ipcountry") || req.headers.get("x-country-code") || "",
    ).trim().toUpperCase();

    await writePresenceDoc(
      decision.anonId,
      caller.uid,
      {
        pais: String(body?.pais || headerCountry || "").trim().toUpperCase(),
        provincia: String(body?.provincia || "").trim(),
        visibilidad: normalizeGeoAudience({
          paises: body?.visibilidadPaises as string[],
          provincias: body?.visibilidadProvincias as string[],
        }),
      },
      sanitizeShuffleVisitorChatId(body?.chatSessionId),
      body?.backgrounded === true,
    );
    try {
      const siblings = await listAnonMatchAdminDocs("anonimos_activos", {
        where: { field: "authUid", value: caller.uid },
        limit: 8,
      });
      await Promise.all(
        siblings
          .map((row) => String(row.id || "").trim())
          .filter((id) => id && id !== decision.anonId)
          .map((id) => deletePresenceDoc(id)),
      );
    } catch {
      // The live alias is already published. A leftover sibling expires on its own.
    }
    invalidateAnonMatchAvailabilityCache();

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

/** Closing the old tab ends CONTACTABILITY, not its three-hour Shuffle card. */
async function endAnonymousPresenceSession(anonId: string) {
  const existing = await getAnonMatchAdminDoc("anonimos_activos", anonId);
  if (!existing) return;
  const seenMs = Date.parse(String(existing.lastSeenAt || existing.updatedAt || ""));
  const expiryMs = (Number.isFinite(seenMs) ? seenMs : Date.now()) + ANON_SHUFFLE_VISIBILITY_MS;
  await setAnonMatchAdminDoc("anonimos_activos", anonId, {
    sessionClosed: true,
    disponibleParaChat: false,
    backgrounded: true,
    expiresAt: new Date(expiryMs).toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * End the caller's old session without deleting their visible Shuffle card.
 * The card expires three hours after its LAST heartbeat; messages require a
 * separate short-lived active session.
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

    await endAnonymousPresenceSession(anonId);
    invalidateAnonMatchAvailabilityCache();

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
