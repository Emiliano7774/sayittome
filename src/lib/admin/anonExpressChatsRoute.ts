import { getRepairAdminDb } from "@/lib/chat/historicalAuthorshipRepairAdmin";

const MAX_CHATS = 300;
const MAX_MESSAGES = 300;

function asText(value: unknown) {
  return String(value || "").trim();
}

function timestampMs(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value) {
    const ms = (value as { toMillis?: () => number }).toMillis?.() || 0;
    if (Number.isFinite(ms)) return ms;
  }
  const parsed = Date.parse(asText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function jsonValue(value: unknown): unknown {
  if (value && typeof value === "object") {
    if ("toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
      return ((value as { toDate: () => Date }).toDate()).toISOString();
    }
    if ("toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
      return new Date(timestampMs(value)).toISOString();
    }
    if (Array.isArray(value)) return value.map(jsonValue);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "_fieldsProto" || key === "firestore") continue;
      out[key] = jsonValue(item);
    }
    return out;
  }
  if (typeof value === "bigint") return Number(value);
  return value;
}

function serializeDoc(id: string, data: Record<string, unknown>) {
  return { id, ...jsonValue(data) as Record<string, unknown> };
}

async function listChats(db: any) {
  try {
    return await db.collection("chats_anonimos").orderBy("updatedAt", "desc").limit(MAX_CHATS).get();
  } catch {
    return await db.collection("chats_anonimos").limit(MAX_CHATS).get();
  }
}

async function listMessages(db: any, chatId: string) {
  const rows: Array<{ collectionName: "mensajes" | "messages"; snap: any }> = [];
  for (const collectionName of ["mensajes", "messages"] as const) {
    try {
      const snap = await db
        .collection("chats_anonimos")
        .doc(chatId)
        .collection(collectionName)
        .orderBy("createdAt", "asc")
        .limit(MAX_MESSAGES)
        .get();
      rows.push({ collectionName, snap });
    } catch {
      try {
        const snap = await db
          .collection("chats_anonimos")
          .doc(chatId)
          .collection(collectionName)
          .limit(MAX_MESSAGES)
          .get();
        rows.push({ collectionName, snap });
      } catch {
        // The alternate collection is optional for legacy chats.
      }
    }
  }

  return rows
    .flatMap(({ collectionName, snap }) =>
      snap.docs.map((doc: any) => ({
        ...serializeDoc(doc.id, doc.data() || {}),
        collectionName,
        createdAtMs: timestampMs(doc.data()?.createdAt),
      })),
    )
    .sort((a, b) => Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0))
    .slice(0, MAX_MESSAGES);
}

export async function handleAdminAnonExpressChatsGet(req: Request) {
  const db = getRepairAdminDb();
  const url = new URL(req.url);
  const chatId = asText(url.searchParams.get("chatId"));

  if (chatId) {
    const snap = await db.collection("chats_anonimos").doc(chatId).get();
    if (!snap.exists) return { status: 404, body: { ok: false, error: "chat_not_found" } };
    return {
      status: 200,
      body: {
        ok: true,
        chat: serializeDoc(snap.id, snap.data() || {}),
        messages: await listMessages(db, chatId),
      },
    };
  }

  const snap = await listChats(db);
  const chats = snap.docs.map((doc: any) => serializeDoc(doc.id, doc.data() || {}));
  chats.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    return timestampMs(b.updatedAt) - timestampMs(a.updatedAt);
  });
  return {
    status: 200,
    body: { ok: true, chats, total: chats.length },
  };
}
