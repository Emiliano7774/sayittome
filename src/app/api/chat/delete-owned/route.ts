import { NextResponse } from "next/server";

import { ABUSE_CHAT_LEASE_COLLECTION } from "@/lib/abuse/profileAnonAbuseBlock";
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

const MESSAGE_COLLECTIONS = ["mensajes", "messages"];

async function deleteCollectionPages(db: {
  batch: () => { delete: (ref: unknown) => void; commit: () => Promise<unknown> };
}, collection: { limit: (n: number) => { get: () => Promise<{ empty: boolean; size: number; docs: Array<{ ref: unknown }> }> } }) {
  for (;;) {
    const snap = await collection.limit(200).get();
    if (snap.empty) return;
    const batch = db.batch();
    for (const docSnap of snap.docs) batch.delete(docSnap.ref);
    await batch.commit();
    if (snap.size < 200) return;
  }
}

async function deleteOwnedChatTree(db: {
  batch: () => { delete: (ref: unknown) => void; commit: () => Promise<unknown> };
  collection: (name: string) => { doc: (id: string) => { delete: () => Promise<unknown> } };
}, chatRef: {
  collection: (name: string) => { limit: (n: number) => { get: () => Promise<{ empty: boolean; size: number; docs: Array<{ ref: unknown }> }> } };
  listCollections?: () => Promise<Array<{ id: string; limit: (n: number) => { get: () => Promise<{ empty: boolean; size: number; docs: Array<{ ref: unknown }> }> } }>>;
  delete: () => Promise<unknown>;
  id: string;
}) {
  for (const name of MESSAGE_COLLECTIONS) {
    await deleteCollectionPages(db, chatRef.collection(name));
  }
  if (typeof chatRef.listCollections === "function") {
    const collections = await chatRef.listCollections();
    for (const collection of collections) {
      if (MESSAGE_COLLECTIONS.includes(collection.id)) continue;
      await deleteCollectionPages(db, collection);
    }
  }
  await chatRef.delete();
  await db.collection(ABUSE_CHAT_LEASE_COLLECTION).doc(chatRef.id).delete().catch(() => undefined);
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
    const username = String(userData.username || "");
    const usernameLower = String(userData.usernameLower || "");

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
      if (!callerOwnsInboxChat({ uid: actor.uid, username, usernameLower, chatId, data })) {
        denied.push(chatId);
        continue;
      }
      await deleteOwnedChatTree(db, ref);
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
