import { NextResponse } from "next/server";

import {
  anonMatchActivityMs,
  anonMatchMessageText,
  firestoreTimeMs,
} from "@/lib/admin/anonMatchChatReview";
import { verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";
import { getRepairAdminDb } from "@/lib/chat/historicalAuthorshipRepairAdmin";

export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}

function safeChat(row: { id: string; data: () => Record<string, unknown> }) {
  const data = row.data() || {};
  return {
    id: row.id,
    tipo: String(data.tipo || ""),
    estado: String(data.estado || ""),
    solicitanteUid: String(data.solicitanteUid || ""),
    destinatarioUid: String(data.destinatarioUid || ""),
    solicitanteAnonId: String(data.solicitanteAnonId || ""),
    destinatarioAnonId: String(data.destinatarioAnonId || data.anonId || ""),
    ultimoMensaje: String(data.ultimoMensaje || "").slice(0, 180),
    createdAtMs: firestoreTimeMs(data.createdAt),
    updatedAtMs: anonMatchActivityMs(data),
  };
}

async function participantLabel(
  db: { collection: (name: string) => { doc: (id: string) => { get: () => Promise<{ data: () => Record<string, unknown> | undefined }> } } },
  uid: string,
  anonId: string,
) {
  if (uid) {
    try {
      const snap = await db.collection("usuarios").doc(uid).get();
      const username = String(snap.data()?.username || "").replace(/^@/, "").trim();
      if (username) return `@${username}`;
    } catch (error) {
      console.error("admin_anon_match_label", error);
    }
    return uid;
  }
  return anonId ? `anónimo ${anonId}` : "anónimo";
}

async function listChats() {
  const db = getRepairAdminDb();
  // createdAt stays an ISO string. updatedAt becomes a Timestamp after the first
  // message, so ordering the collection by updatedAt fails on mixed types.
  try {
    return await db.collection("chats_anonimos").orderBy("createdAt", "desc").limit(250).get();
  } catch {
    return await db.collection("chats_anonimos").limit(250).get();
  }
}

export async function GET(req: Request) {
  try {
    await verifyAdminIdToken(req);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return noStore({ ok: false, error: status === 403 ? "forbidden" : "unauthorized" }, status);
  }

  const chatId = String(new URL(req.url).searchParams.get("chatId") || "").trim();
  try {
    const db = getRepairAdminDb();
    if (!chatId) {
      const snap = await listChats();
      const chats = snap.docs.map((row: { id: string; data: () => Record<string, unknown> }) =>
        safeChat(row),
      );
      chats.sort(
        (a: { updatedAtMs: number; id: string }, b: { updatedAtMs: number; id: string }) =>
          b.updatedAtMs - a.updatedAtMs || a.id.localeCompare(b.id),
      );
      return noStore({ ok: true, chats });
    }

    if (chatId.length > 180 || chatId.includes("/")) {
      return noStore({ ok: false, error: "invalid_chat" }, 400);
    }

    const chatRef = db.collection("chats_anonimos").doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) return noStore({ ok: false, error: "chat_not_found" }, 404);

    const chatData = chatSnap.data() || {};
    const collections = ["mensajes", "messages"] as const;
    const batches = await Promise.all(
      collections.map(async (name) => {
        let snap;
        try {
          snap = await chatRef.collection(name).orderBy("createdAt", "desc").limit(400).get();
        } catch {
          snap = await chatRef.collection(name).limit(400).get();
        }
        return snap.docs.map((row: { id: string; data: () => Record<string, unknown> }) => {
          const data = row.data() || {};
          return {
            id: row.id,
            collectionName: name,
            text: anonMatchMessageText(data),
            senderId: String(data.senderId || data.fromUid || data.ownerId || ""),
            senderTipo: String(data.senderTipo || data.senderKind || ""),
            type: String(data.type || "text"),
            createdAtMs: firestoreTimeMs(data.createdAt),
          };
        });
      }),
    );
    const [solicitanteLabel, destinatarioLabel] = await Promise.all([
      participantLabel(db, String(chatData.solicitanteUid || ""), String(chatData.solicitanteAnonId || "")),
      participantLabel(
        db,
        String(chatData.destinatarioUid || ""),
        String(chatData.destinatarioAnonId || chatData.anonId || ""),
      ),
    ]);
    const messages = batches
      .flat()
      .sort((a: { createdAtMs: number; id: string }, b: { createdAtMs: number; id: string }) =>
        a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id),
      );

    return noStore({
      ok: true,
      chat: {
        ...safeChat({ id: chatSnap.id, data: () => chatData }),
        solicitanteLabel,
        destinatarioLabel,
      },
      messages,
    });
  } catch (error) {
    console.error("admin_anon_match_chats", error);
    return noStore({ ok: false, error: "admin_anon_match_failed" }, 500);
  }
}
