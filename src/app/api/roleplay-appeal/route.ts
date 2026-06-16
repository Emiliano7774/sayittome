import { NextResponse } from "next/server";

import { createFirestoreDoc, getFirestoreDoc } from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const uid = String(body?.uid || "").trim();
    const username = String(body?.username || "").trim();
    const mensaje = String(body?.mensaje || "").trim();
    const evidenceUrl = String(body?.evidenceUrl || "").trim();
    const reporterEmail = String(body?.reporterEmail || "").trim();

    if (!uid || !mensaje) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }

    const profile = await getFirestoreDoc("usuarios", uid);
    if (!profile || String(profile.moderationTag || "") !== "roleplay") {
      return NextResponse.json({ ok: false, error: "not_roleplay_profile" }, { status: 403 });
    }

    const resolvedUsername = String(
      profile.username || profile.usernameLower || username || "usuario",
    );

    const appeal = await createFirestoreDoc("reclamos_perfil_rol", {
      uid,
      username: resolvedUsername,
      reporterEmail,
      mensaje,
      evidenceUrl,
      moderationTag: "roleplay",
      estado: "pendiente",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, appeal, ts: Date.now() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
