import { NextResponse } from "next/server";

import { verifyFirebaseIdTokenAllowingAnonymous } from "@/lib/admin/verifyAdminRequest";
import {
  USAGE_COLLECTION,
  applyUsagePing,
  readUsageVisit,
  usageDayKey,
} from "@/lib/usage/appUsage";

export const dynamic = "force-dynamic";

function cleanUsername(value: unknown) {
  return String(value || "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 80);
}

export async function POST(req: Request) {
  try {
    const actor = await verifyFirebaseIdTokenAllowingAnonymous(req, {
      allowUnverifiedEmail: true,
    });
    const body = (await req.json().catch(() => null)) as {
      visibleMs?: unknown;
      sessionStart?: unknown;
    } | null;

    const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
    const db = getRepairAdminDb();
    const nowIso = new Date().toISOString();
    const day = usageDayKey(new Date(nowIso));
    const ref = db.collection(USAGE_COLLECTION).doc(day).collection("visits").doc(
      actor.isAnonymous ? `anon_${actor.uid}` : actor.uid,
    );

    await db.runTransaction(async (tx: {
      get: (target: unknown) => Promise<{ exists: boolean; data: () => Record<string, unknown> }>;
      set: (target: unknown, data: Record<string, unknown>, options: { merge: boolean }) => void;
    }) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? readUsageVisit(snap.data()) : null;
      let username = existing?.username || "";
      if (!actor.isAnonymous && !username) {
        const profile = await tx.get(db.collection("usuarios").doc(actor.uid));
        if (profile.exists) {
          const data = profile.data();
          username = cleanUsername(data.username || data.nombre);
        }
      }

      const next = applyUsagePing(existing, {
        nowIso,
        visibleMs: body?.visibleMs,
        sessionStart: body?.sessionStart === true,
        username,
        uid: actor.uid,
        anonymous: actor.isAnonymous,
      });
      tx.set(ref, next, { merge: true });
    });

    return NextResponse.json({ ok: true, day });
  } catch (error: unknown) {
    const status = Number((error as { status?: number })?.status || 500);
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json(
      { ok: false, error: message },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
