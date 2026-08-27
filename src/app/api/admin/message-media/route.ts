import { NextResponse } from "next/server";

import { readAdminMessageMedia } from "@/lib/admin/adminMessageMediaRead";
import { mapAdminAuthFailure, verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";
import { exactMessageCollectionName } from "@/lib/moderation/moderationMessageCollections";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await verifyAdminIdToken(req);
  } catch (error) {
    const mapped = mapAdminAuthFailure(error);
    return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
  }

  const url = new URL(req.url);
  const chatId = String(url.searchParams.get("chatId") || "").trim();
  const messageId = String(url.searchParams.get("messageId") || "").trim();
  const collectionName = exactMessageCollectionName(url.searchParams.get("collection")) || "mensajes";

  const result = await readAdminMessageMedia({
    chatId,
    messageId,
    collectionName,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
