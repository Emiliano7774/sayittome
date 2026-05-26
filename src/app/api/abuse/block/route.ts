import { NextResponse } from "next/server";

import {
  DEFAULT_ABUSE_BLOCK_MINUTES,
  getRequestClientIp,
} from "@/lib/abuse/anonAbuseBlocks";
import { buildAbuseFingerprint, buildVisitorBlockKey } from "@/lib/abuse/fingerprint";
import { createFirestoreDoc } from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

function blockDocId(receptorUid: string, blockedVisitorId: string) {
  const safeVisitor = blockedVisitorId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  return `${receptorUid}__vis__${safeVisitor}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const receptorUid = String(body?.receptorUid || "");
    const blockedAnonId = String(body?.blockedAnonId || "");
    const blockedVisitorId = String(body?.blockedVisitorId || "");
    const chatId = String(body?.chatId || "");
    const motivo = String(body?.motivo || "bloqueo_30m");
    const blockedBy = String(body?.blockedBy || "");
    const durationMinutes = Number(body?.durationMinutes || DEFAULT_ABUSE_BLOCK_MINUTES);

    if (!receptorUid || !blockedVisitorId || !chatId) {
      return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
    }

    const blockedClientIp = getRequestClientIp(req);
    const blockedFingerprint = buildVisitorBlockKey(blockedVisitorId);
    const legacyFingerprint = buildAbuseFingerprint(blockedAnonId, blockedVisitorId);
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
    const id = blockDocId(receptorUid, blockedVisitorId);

    const block = await createFirestoreDoc(
      "anon_abuse_blocks",
      {
        receptorUid,
        blockedFingerprint,
        legacyFingerprint,
        blockedAnonId,
        blockedVisitorId,
        blockedClientIp: blockedClientIp || null,
        motivo,
        createdAt: new Date().toISOString(),
        expiresAt,
        chatId,
        blockedBy,
      },
      id,
    );

    return NextResponse.json({
      ok: true,
      block,
      blockedClientIp,
      ts: Date.now(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
