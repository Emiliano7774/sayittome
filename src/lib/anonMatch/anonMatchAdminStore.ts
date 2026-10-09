import { getRepairAdminDb } from "@/lib/chat/historicalAuthorshipRepairAdmin";

export type AnonMatchAdminCollection =
  | "usuarios"
  | "anonimos_activos"
  | "anon_arrival_announcements"
  | "solicitudes_chat_anonimo"
  | "chats_anonimos"
  | "reportes";

type QueryOptions = {
  limit?: number;
  orderField?: string;
  direction?: "asc" | "desc";
  where?: {
    field: string;
    op?: "==";
    value: unknown;
  };
};

function normalizeAdminValue(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(normalizeAdminValue);
  if (typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === "function") {
      return maybeTimestamp.toDate().toISOString();
    }
    if (Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          normalizeAdminValue(item),
        ]),
      );
    }
  }
  return value;
}

function asRow(
  id: string,
  data: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const normalized = normalizeAdminValue(data || {}) as Record<string, unknown>;
  return { id, ...normalized };
}

export async function getAnonMatchAdminDoc(
  collection: AnonMatchAdminCollection,
  id: string,
) {
  const key = String(id || "").trim();
  if (!key) return null;
  const snap = await getRepairAdminDb().collection(collection).doc(key).get();
  return snap.exists ? asRow(snap.id, snap.data()) : null;
}

export async function setAnonMatchAdminDoc(
  collection: AnonMatchAdminCollection,
  id: string,
  data: Record<string, unknown>,
) {
  const key = String(id || "").trim();
  if (!key) throw new Error("missing_doc_id");
  await getRepairAdminDb().collection(collection).doc(key).set(data, { merge: true });
}

export async function deleteAnonMatchAdminDoc(
  collection: AnonMatchAdminCollection,
  id: string,
) {
  const key = String(id || "").trim();
  if (!key) throw new Error("missing_doc_id");
  await getRepairAdminDb().collection(collection).doc(key).delete();
}

export async function createAnonMatchAdminDoc(
  collection: AnonMatchAdminCollection,
  id: string,
  data: Record<string, unknown>,
) {
  const key = String(id || "").trim();
  if (!key) throw new Error("missing_doc_id");
  const ref = getRepairAdminDb().collection(collection).doc(key);
  try {
    await ref.create(data);
    return { created: true as const };
  } catch (error) {
    const code = String((error as { code?: string | number })?.code || "");
    const message = String((error as Error)?.message || "");
    if (code === "6" || /already exists/i.test(message)) {
      return { created: false as const };
    }
    throw error;
  }
}

export async function addAnonMatchAdminDoc(
  collection: AnonMatchAdminCollection,
  data: Record<string, unknown>,
) {
  const ref = await getRepairAdminDb().collection(collection).add(data);
  return ref.id as string;
}

export async function listAnonMatchAdminDocs(
  collection: AnonMatchAdminCollection,
  options: QueryOptions = {},
): Promise<Record<string, unknown>[]> {
  let query = getRepairAdminDb().collection(collection);
  if (options.where) {
    query = query.where(
      options.where.field,
      options.where.op || "==",
      options.where.value,
    );
  }
  if (options.orderField) {
    query = query.orderBy(options.orderField, options.direction || "desc");
  }
  if (options.limit) query = query.limit(options.limit);
  const snap = await query.get();
  return snap.docs.map((doc: { id: string; data: () => Record<string, unknown> }) =>
    asRow(doc.id, doc.data()),
  );
}

export async function listAnonMatchMessageExcerpt(
  chatId: string,
  limitCount = 8,
): Promise<Record<string, unknown>[]> {
  const key = String(chatId || "").trim();
  if (!key) return [];
  const snap = await getRepairAdminDb()
    .collection("chats_anonimos")
    .doc(key)
    .collection("mensajes")
    .orderBy("createdAt", "desc")
    .limit(limitCount)
    .get();
  return snap.docs.map((doc: { id: string; data: () => Record<string, unknown> }) =>
    asRow(doc.id, doc.data()),
  );
}
