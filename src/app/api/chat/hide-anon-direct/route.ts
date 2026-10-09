import { NextResponse } from "next/server";
import type { DocumentReference, Transaction } from "firebase-admin/firestore";

import { verifyFirebaseIdTokenAllowingAnonymous } from "@/lib/admin/verifyAdminRequest";
import { exactChatId } from "@/lib/chat/ownedChatDelete";
import { anonDirectCanHideChat, anonDirectMessageMarker } from "@/lib/chat/anonDirectHidePolicy";
import { getRepairAdminDb } from "@/lib/chat/historicalAuthorshipRepairAdmin";

export const dynamic = "force-dynamic";

const MAX_IDS = 25;

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}

 /**
 * Hides a direct anonymous chat only for its authenticated participant.
 * Does not delete the conversation, its messages, moderation evidence or
 * the other participant's inbox. A subsequent message resurfaces the thread.
 */
export async function POST(req: Request) {
  let actor;
  try {
    actor = await verifyFirebaseIdTokenAllowingAnonymous(req);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return reply({ ok: false, error: status === 403 ? "forbidden" : "unauthorized" }, status);
  }

  let body: { chatIds?: unknown };
  try {
    body = (await req.json()) as { chatIds?: unknown };
  } catch {
    return reply({ ok: false, error: "invalid_json" }, 400);
  }

  const ids = [...new Set(
    (Array.isArray(body.chatIds) ? body.chatIds : [])
      .map(exactChatId)
      .filter(Boolean),
  )];
  if (ids.length === 0) return reply({ ok: false, error: "invalid_chat" }, 400);
  if (ids.length > MAX_IDS) return reply({ ok: false, error: "too_many" }, 400);

  try {
    const db = getRepairAdminDb();
    const hidden: string[] = [];
    const denied: string[] = [];
    for (const chatId of ids) {
      const ref = db.collection("chats_anonimos").doc(chatId);
      const allowed = await db.runTransaction(async (tx: Transaction) => {
        const snap = await tx.get(ref as DocumentReference);
        if (!snap.exists) return false;
        const data = (snap.data() || {}) as Record<string, unknown>;
        if (!anonDirectCanHideChat(
          actor.uid,
          String(data.solicitanteAuthUid || ""),
          String(data.destinatarioAuthUid || ""),
        )) return false;
        const lastAt = data.lastMessageAt as { toMillis?: () => number } | undefined;
        const atMs = lastAt && typeof lastAt.toMillis === "function" ? lastAt.toMillis() : 0;
        tx.update(ref, {
          [`hiddenAtMessageByUid.${actor.uid}`]: anonDirectMessageMarker(data.latestMessageId, atMs),
          [`hiddenAtByUid.${actor.uid}`]: new Date(),
        });
        return true;
      });
      if (allowed) hidden.push(chatId);
      else denied.push(chatId);
    }
    if (!hidden.length) return reply({ ok: false, error: "forbidden", hidden, denied }, 403);
    return reply({ ok: denied.length === 0, hidden, denied }, denied.length ? 207 : 200);
  } catch (error) {
    console.error("[anon-direct-hide]", error);
    return reply({ ok: false, error: "hide_failed" }, 500);
  }
}
