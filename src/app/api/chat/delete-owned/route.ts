import { NextResponse } from "next/server";

import { verifyFirebaseIdToken } from "@/lib/admin/verifyAdminRequest";
import { callerOwnsInboxChat, exactChatId } from "@/lib/chat/ownedChatDelete";
import { getRepairAdminDb } from "@/lib/chat/historicalAuthorshipRepairAdmin";

export const dynamic = "force-dynamic";

const MAX_IDS = 25;

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}

export async function POST(req: Request) {
  let actor;
  try {
    actor = await verifyFirebaseIdToken(req);
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

  const chatIds = [...new Set((Array.isArray(body.chatIds) ? body.chatIds : []).map(exactChatId).filter(Boolean))];
  if (chatIds.length === 0) return reply({ ok: false, error: "invalid_chat" }, 400);
  if (chatIds.length > MAX_IDS) return reply({ ok: false, error: "too_many" }, 400);

  try {
    const db = getRepairAdminDb();
    const userSnap = await db.collection("usuarios").doc(actor.uid).get();
    const userData = (userSnap.data() || {}) as Record<string, unknown>;
    const username = String(userData.username || userData.usernameLower || "");

    const deleted: string[] = [];
    const denied: string[] = [];

    for (const chatId of chatIds) {
      const ref = db.collection("chats").doc(chatId);
      const snap = await ref.get();
      if (!snap.exists) {
        deleted.push(chatId);
        continue;
      }
      const data = (snap.data() || {}) as Record<string, unknown>;
      if (!callerOwnsInboxChat({ uid: actor.uid, username, chatId, data })) {
        denied.push(chatId);
        continue;
      }
      await db.recursiveDelete(ref);
      deleted.push(chatId);
    }

    if (deleted.length === 0) {
      return reply({ ok: false, error: "forbidden", deleted, denied }, 403);
    }
    return reply({ ok: true, deleted, denied });
  } catch (error) {
    console.error("delete_owned_chats", error);
    return reply({ ok: false, error: "delete_failed" }, 500);
  }
}
