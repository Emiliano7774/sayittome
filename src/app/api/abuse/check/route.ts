import { NextResponse } from "next/server";

import { runCollectionQuery } from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

function isBlockActive(block: Record<string, unknown>, now: number) {
  const expiresAt = String(block.expiresAt || "");
  if (!expiresAt) return true;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return true;
  return date.getTime() > now;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const receptorUid = String(searchParams.get("receptorUid") || "");
    const fingerprint = String(searchParams.get("fingerprint") || "");
    const blockedAnonId = String(searchParams.get("blockedAnonId") || "");
    const blockedVisitorId = String(searchParams.get("blockedVisitorId") || "");

    if (!receptorUid) {
      return NextResponse.json({ ok: false, error: "missing receptorUid" }, { status: 400 });
    }

    const blocks = await runCollectionQuery("anon_abuse_blocks", 500);
    const now = Date.now();

    const active = blocks.find((block) => {
      if (String(block.receptorUid) !== receptorUid) return false;
      if (!isBlockActive(block, now)) return false;

      if (fingerprint && String(block.blockedFingerprint) === fingerprint) return true;
      if (blockedAnonId && String(block.blockedAnonId) === blockedAnonId) return true;
      if (blockedVisitorId && String(block.blockedVisitorId) === blockedVisitorId) {
        return true;
      }

      return false;
    });

    return NextResponse.json({
      ok: true,
      blocked: Boolean(active),
      block: active || null,
      ts: now,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
