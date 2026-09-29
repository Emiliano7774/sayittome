import { getRepairAdminDb } from "@/lib/chat/historicalAuthorshipRepairAdmin";

export type BoostPrivateCollection =
  | "usuarios"
  | "referral_codes"
  | "referrals"
  | "shuffle_boosts";

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

function row(
  id: string,
  data: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const normalized = normalizeAdminValue(data || {}) as Record<string, unknown>;
  return { id, ...normalized };
}

export async function getBoostAdminDoc(
  collection: BoostPrivateCollection,
  id: string,
) {
  const key = String(id || "").trim();
  if (!key) return null;
  const snap = await getRepairAdminDb().collection(collection).doc(key).get();
  return snap.exists ? row(snap.id, snap.data()) : null;
}

export async function setBoostAdminDoc(
  collection: BoostPrivateCollection,
  id: string,
  data: Record<string, unknown>,
) {
  const key = String(id || "").trim();
  if (!key) throw new Error("missing_doc_id");
  await getRepairAdminDb().collection(collection).doc(key).set(data, { merge: true });
}

export async function createBoostAdminDoc(
  collection: BoostPrivateCollection,
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

export async function listBoostAdminDocs(
  collection: BoostPrivateCollection,
  options: {
    limit?: number;
    orderField?: string;
    direction?: "asc" | "desc";
    where?: { field: string; value: unknown };
  } = {},
): Promise<Record<string, unknown>[]> {
  let query = getRepairAdminDb().collection(collection);
  if (options.where) {
    query = query.where(options.where.field, "==", options.where.value);
  }
  if (options.orderField) {
    query = query.orderBy(options.orderField, options.direction || "desc");
  }
  if (options.limit) query = query.limit(options.limit);
  const snap = await query.get();
  return snap.docs.map((doc: { id: string; data: () => Record<string, unknown> }) =>
    row(doc.id, doc.data()),
  );
}
