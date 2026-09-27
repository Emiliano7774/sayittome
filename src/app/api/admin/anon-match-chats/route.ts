import { NextResponse } from "next/server";

import {
  anonMatchActivityMs,
  anonMatchInteractionId,
  anonMatchMessageText,
  collapseAnonMatchChatRows,
  firestoreTimeMs,
  selectAnonMatchMessageRows,
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
  const interactionId = anonMatchInteractionId(row.id, data);
  return {
    id: interactionId,
    sourceDocIds: [row.id],
    sourceCount: 1,
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

async function interactionDocs(
  db: ReturnType<typeof getRepairAdminDb>,
  interactionId: string,
) {
  const byId = new Map<
    string,
    { id: string; data: () => Record<string, unknown> }
  >();
  const direct = await db.collection("chats_anonimos").doc(interactionId).get();
  if (direct.exists) byId.set(direct.id, direct);

  for (const field of ["chatId", "directChatId", "sessionId"] as const) {
    try {
      const snap = await db
        .collection("chats_anonimos")
        .where(field, "==", interactionId)
        .get();
      for (const row of snap.docs) byId.set(row.id, row);
    } catch (error) {
      console.error("admin_anon_match_interaction_lookup", field, error);
    }
  }

  return [...byId.values()];
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
  // Admin review is intentionally retroactive. A creation-ordered limit hid
  // active older sessions as soon as more than 250 chats existed.
  return db.collection("chats_anonimos").get();
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
      const chats = collapseAnonMatchChatRows(
        snap.docs.map((row: { id: string; data: () => Record<string, unknown> }) =>
          safeChat(row),
        ),
      );
      return noStore({ ok: true, chats });
    }

    if (chatId.length > 180 || chatId.includes("/")) {
      return noStore({ ok: false, error: "invalid_chat" }, 400);
    }

    const sourceDocs = await interactionDocs(db, chatId);
    if (sourceDocs.length === 0) {
      return noStore({ ok: false, error: "chat_not_found" }, 404);
    }
    sourceDocs.sort(
      (a, b) => anonMatchActivityMs(b.data() || {}) - anonMatchActivityMs(a.data() || {}),
    );
    const representative = sourceDocs[0];
    const chatData = representative.data() || {};
    const collections = ["mensajes", "messages"] as const;
    const batchesBySource = await Promise.all(
      sourceDocs.map((sourceDoc) =>
        Promise.all(
          collections.map(async (name) => {
            const chatRef = db.collection("chats_anonimos").doc(sourceDoc.id);
            let snap;
            try {
              snap = await chatRef.collection(name).orderBy("createdAt", "asc").get();
            } catch {
              snap = await chatRef.collection(name).get();
            }
            return snap.docs.map((row: { id: string; data: () => Record<string, unknown> }) => {
              const data = row.data() || {};
              return {
                id: `${sourceDoc.id}:${row.id}`,
                collectionName: name,
                text: anonMatchMessageText(data),
                senderId: String(data.senderId || data.fromUid || data.ownerId || ""),
                senderTipo: String(data.senderTipo || data.senderKind || ""),
                type: String(data.type || "text"),
                createdAtMs: firestoreTimeMs(data.createdAt),
              };
            });
          }),
        ),
      ),
    );
    const [solicitanteLabel, destinatarioLabel] = await Promise.all([
      participantLabel(db, String(chatData.solicitanteUid || ""), String(chatData.solicitanteAnonId || "")),
      participantLabel(
        db,
        String(chatData.destinatarioUid || ""),
        String(chatData.destinatarioAnonId || chatData.anonId || ""),
      ),
    ]);
    const messages = selectAnonMatchMessageRows({
      mensajes: batchesBySource.flatMap((batch) => batch[0]),
      messages: batchesBySource.flatMap((batch) => batch[1]),
    });

    return noStore({
      ok: true,
      chat: {
        ...safeChat({ id: chatId, data: () => ({ ...chatData, chatId }) }),
        sourceDocIds: sourceDocs.map((row) => row.id),
        sourceCount: sourceDocs.length,
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
