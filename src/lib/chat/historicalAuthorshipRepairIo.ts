import {
  FIRESTORE_API_KEY,
  FIRESTORE_PROJECT_ID,
  getFirestoreDoc,
  parseFirestoreDoc,
} from "@/lib/firestore/rest";
import { fetchProfileUidByUsername } from "@/lib/moderation/fetchUserChats";
import {
  persistedAuthorFromDoc,
  resolveThreadIdentities,
  type RepairMessageInput,
  type ThreadIdentities,
} from "@/lib/chat/historicalAuthorshipRepair";

export async function loadRepairThread(chatId: string): Promise<{
  identities: ThreadIdentities;
  messages: RepairMessageInput[];
}> {
  const chat = (await getFirestoreDoc("chats", chatId)) || {};
  const slug = String(
    chat.receptorUsername || chat.targetUsername || "",
  ).trim();
  const ownerProfileIdFromUsername = slug
    ? await fetchProfileUidByUsername(slug)
    : "";

  const identities = resolveThreadIdentities({
    chatId,
    ownerProfileIdFromUsername,
    receptorUid: String(chat.receptorUid || "").trim(),
    anonOwnerUid: String(chat.anonOwnerUid || "").trim(),
  });

  const messages = await listChatMensajes(chatId);
  return { identities, messages };
}

export async function listChatMensajes(chatId: string): Promise<RepairMessageInput[]> {
  const parent = `projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/chats/${chatId}`;
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${encodeURIComponent(FIRESTORE_API_KEY)}`;

  const run = async (order: boolean) => {
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId: "mensajes" }],
      limit: 200,
    };
    if (order) {
      structuredQuery.orderBy = [
        { field: { fieldPath: "createdAt" }, direction: "ASCENDING" },
      ];
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ parent, structuredQuery }),
    });
    if (!res.ok) throw new Error(`list mensajes ${res.status}`);
    const json = (await res.json()) as Array<{ document?: Record<string, unknown> }>;
    if (!Array.isArray(json)) return [];
    return json
      .map((row) => row.document)
      .filter(Boolean)
      .map((doc) => parseFirestoreDoc(doc));
  };

  let docs: Record<string, unknown>[] = [];
  try {
    docs = await run(true);
  } catch {
    docs = await run(false);
  }

  return docs.map((doc) => ({
    id: String(doc.id || ""),
    text: String(doc.texto || doc.text || ""),
    createdAt: String(doc.createdAt || doc._firestoreCreateTime || ""),
    persisted: persistedAuthorFromDoc(doc),
  }));
}
