import { NextResponse } from "next/server";

import {
  readAdminMessageMedia,
  readAdminMessageMediaBytes,
} from "@/lib/admin/adminMessageMediaRead";
import { mapAdminAuthFailure, verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";
import { exactMessageCollectionName } from "@/lib/moderation/moderationMessageCollections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

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
  const raw = url.searchParams.get("raw") === "1";

  const result = await readAdminMessageMedia({
    chatId,
    messageId,
    collectionName,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: NO_STORE_HEADERS },
    );
  }

  if (raw) {
    const media = await readAdminMessageMediaBytes(result);
    if (!media.ok) {
      return NextResponse.json(
        { ok: false, error: media.error },
        { status: media.status, headers: NO_STORE_HEADERS },
      );
    }

    const responseBytes = new Uint8Array(media.bytes.byteLength);
    responseBytes.set(media.bytes);
    return new Response(responseBytes.buffer, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": media.contentType,
        "Content-Length": String(media.bytes.byteLength),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "X-SayItToMe-Media-Type": result.type,
        "X-SayItToMe-Media-Source": result.source,
      },
    });
  }

  return NextResponse.json(
    {
      ok: true,
      type: result.type,
      viewOnce: result.viewOnce,
      viewOnceLimit: result.viewOnceLimit,
      viewOnceOpenedCount: result.viewOnceOpenedCount,
      viewOnceExhausted: result.viewOnceExhausted,
      readOnly: true,
      source: result.source,
      mediaUrl: result.mediaUrl,
      recovered: result.source === "storage_recovery",
    },
    { headers: NO_STORE_HEADERS },
  );
}
