export const FIRESTORE_PROJECT_ID = "sayittome-app";

export const FIRESTORE_API_KEY =
  process.env.FIREBASE_API_KEY || "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";

type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { nullValue: null };

export function toFirestoreFields(
  data: Record<string, unknown>,
): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value === null) {
      fields[key] = { nullValue: null };
    } else if (typeof value === "boolean") {
      fields[key] = { booleanValue: value };
    } else if (typeof value === "number") {
      fields[key] = Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    } else {
      fields[key] = { stringValue: String(value) };
    }
  }

  return fields;
}

export function parseFirestoreValue(field: any): unknown {
  if (!field) return undefined;
  if ("stringValue" in field) return field.stringValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return field.doubleValue;
  if ("timestampValue" in field) return field.timestampValue;
  if ("nullValue" in field) return null;
  if ("arrayValue" in field) {
    return (
      field.arrayValue?.values?.map((item: any) => parseFirestoreValue(item)) || []
    );
  }
  if ("mapValue" in field) {
    const out: Record<string, unknown> = {};
    const mapFields = field.mapValue?.fields || {};
    for (const [key, value] of Object.entries(mapFields)) {
      out[key] = parseFirestoreValue(value);
    }
    return out;
  }
  return undefined;
}

export function parseFirestoreDoc(doc: any) {
  const fields = doc?.fields || {};
  const parsed: Record<string, unknown> = { id: String(doc.name || "").split("/").pop() || "" };

  for (const [key, value] of Object.entries(fields)) {
    parsed[key] = parseFirestoreValue(value);
  }

  return parsed;
}

export async function runCollectionQuery(
  collectionId: string,
  limit = 500,
  orderField?: string,
  direction: "ASCENDING" | "DESCENDING" = "DESCENDING",
) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_API_KEY}`;

  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId }],
    limit,
  };

  if (orderField) {
    structuredQuery.orderBy = [{ field: { fieldPath: orderField }, direction }];
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) {
    throw new Error(`Firestore runQuery ${collectionId} ${res.status}`);
  }

  const json = await res.json();

  if (!Array.isArray(json)) return [];

  return json
    .map((row: any) => row.document)
    .filter(Boolean)
    .map(parseFirestoreDoc);
}

export async function patchFirestoreDoc(
  collection: string,
  id: string,
  fields: Record<string, unknown>,
) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`,
  );
  url.searchParams.set("key", FIRESTORE_API_KEY);

  Object.keys(fields).forEach((key) => {
    url.searchParams.append("updateMask.fieldPaths", key);
  });

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ fields: toFirestoreFields(fields) }),
  });

  if (!res.ok) {
    throw new Error(`patch ${collection}/${id} ${res.status}`);
  }

  return res.json();
}

export async function createFirestoreDoc(
  collection: string,
  fields: Record<string, unknown>,
  id?: string,
) {
  const base = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}`;
  const url = id
    ? `${base}?documentId=${encodeURIComponent(id)}&key=${FIRESTORE_API_KEY}`
    : `${base}?key=${FIRESTORE_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ fields: toFirestoreFields(fields) }),
  });

  if (!res.ok) {
    throw new Error(`create ${collection} ${res.status}`);
  }

  return parseFirestoreDoc(await res.json());
}

export async function deleteFirestoreDoc(collection: string, id: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?key=${FIRESTORE_API_KEY}`;

  const res = await fetch(url, { method: "DELETE", cache: "no-store" });

  if (!res.ok) {
    throw new Error(`delete ${collection}/${id} ${res.status}`);
  }
}
