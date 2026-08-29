import {
  buildPaginatedCollectionStructuredQuery,
  mergePaginatedQueryDocs,
} from "@/lib/firestore/deterministicPagination";

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

function isTimestampField(key: string, value: string) {
  if (!value || Number.isNaN(Date.parse(value))) return false;
  return /(?:At|Date|On)$/i.test(key) || key === "fechaCreacion" || key === "fechaRegistro";
}

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
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else if (typeof value === "string" && isTimestampField(key, value)) {
      fields[key] = { timestampValue: new Date(value).toISOString() };
    } else {
      fields[key] = { stringValue: String(value) };
    }
  }

  return fields;
}

export function toFirestoreMapValue(map: Record<string, boolean>) {
  const fields: Record<string, { booleanValue: boolean }> = {};
  for (const [key, value] of Object.entries(map)) {
    fields[key] = { booleanValue: value === true };
  }
  return { mapValue: { fields } };
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

  if (doc?.createTime) parsed._firestoreCreateTime = doc.createTime;
  if (doc?.updateTime) parsed._firestoreUpdateTime = doc.updateTime;

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

type FirestoreRunQueryRow = {
  document?: {
    name?: string;
    fields?: Record<string, unknown>;
  };
};

export async function runCollectionQueryAll(
  collectionId: string,
  orderField?: string,
  direction: "ASCENDING" | "DESCENDING" = "DESCENDING",
  pageSize = 500,
  maxPages = 20,
) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_API_KEY}`;
  const all: Record<string, unknown>[] = [];
  let cursorDoc: Record<string, unknown> | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const structuredQuery: Record<string, unknown> = orderField
      ? buildPaginatedCollectionStructuredQuery({
          collectionId,
          orderField,
          direction,
          pageSize,
          cursorDoc,
          projectId: FIRESTORE_PROJECT_ID,
        })
      : {
          from: [{ collectionId }],
          limit: pageSize,
        };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ structuredQuery }),
    });

    if (!res.ok) {
      throw new Error(`Firestore runQueryAll ${collectionId} ${res.status}`);
    }

    const json = (await res.json()) as FirestoreRunQueryRow[];
    if (!Array.isArray(json)) break;

    const docs = json
      .map((row) => row.document)
      .filter(Boolean)
      .map(parseFirestoreDoc);

    if (docs.length === 0) break;

    mergePaginatedQueryDocs(all, docs, Boolean(cursorDoc));

    if (docs.length < pageSize) break;
    cursorDoc = docs[docs.length - 1];
  }

  return all;
}

export async function runFilteredCollectionQueryAll(
  collectionId: string,
  fieldPath: string,
  value: string,
  orderField?: string,
  direction: "ASCENDING" | "DESCENDING" = "DESCENDING",
  pageSize = 300,
  maxPages = 40,
) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_API_KEY}`;
  const all: Record<string, unknown>[] = [];
  let cursorDoc: Record<string, unknown> | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const structuredQuery: Record<string, unknown> = orderField
      ? buildPaginatedCollectionStructuredQuery({
          collectionId,
          orderField,
          direction,
          pageSize,
          cursorDoc,
          projectId: FIRESTORE_PROJECT_ID,
          where: {
            fieldFilter: {
              field: { fieldPath },
              op: "EQUAL",
              value: { stringValue: value },
            },
          },
        })
      : {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath },
              op: "EQUAL",
              value: { stringValue: value },
            },
          },
          limit: pageSize,
        };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ structuredQuery }),
    });

    if (!res.ok) {
      throw new Error(`Firestore runFilteredQueryAll ${collectionId} ${res.status}`);
    }

    const json = (await res.json()) as FirestoreRunQueryRow[];
    if (!Array.isArray(json)) break;

    const docs = json
      .map((row) => row.document)
      .filter(Boolean)
      .map(parseFirestoreDoc);

    if (docs.length === 0) break;

    mergePaginatedQueryDocs(all, docs, Boolean(cursorDoc));

    if (docs.length < pageSize) break;
    cursorDoc = docs[docs.length - 1];
  }

  return all;
}

export async function getFirestoreDoc(collection: string, id: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?key=${FIRESTORE_API_KEY}`;

  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`get ${collection}/${id} ${res.status}`);
  }

  return parseFirestoreDoc(await res.json());
}

function buildPatchUrl(collection: string, id: string, fieldKeys: string[]) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`,
  );
  url.searchParams.set("key", FIRESTORE_API_KEY);
  for (const key of fieldKeys) {
    url.searchParams.append("updateMask.fieldPaths", key);
  }
  return url;
}

function splitPatchFields(fields: Record<string, unknown>) {
  const setFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) setFields[key] = value;
  }
  return setFields;
}

/**
 * PATCH with API key only. Subject to security rules as unauthenticated.
 * Do NOT use for privileged usuarios admin writes — use patchFirestoreDocAuthed.
 * Pass `undefined` to delete a field (updateMask only; omitted from body).
 */
export async function patchFirestoreDoc(
  collection: string,
  id: string,
  fields: Record<string, unknown>,
) {
  const url = buildPatchUrl(collection, id, Object.keys(fields));
  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ fields: toFirestoreFields(splitPatchFields(fields)) }),
  });

  if (!res.ok) {
    throw new Error(`patch ${collection}/${id} ${res.status}`);
  }

  return res.json();
}

/**
 * PATCH as a verified Firebase user (Bearer ID token). Required for admin
 * writes to usuarios after catch-all exclusion — rules evaluate request.auth.
 */
export async function patchFirestoreDocAuthed(
  idToken: string,
  collection: string,
  id: string,
  fields: Record<string, unknown>,
) {
  const token = String(idToken || "").trim();
  if (!token) {
    throw Object.assign(new Error("missing_id_token"), { status: 401 });
  }

  const url = buildPatchUrl(collection, id, Object.keys(fields));
  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    body: JSON.stringify({ fields: toFirestoreFields(splitPatchFields(fields)) }),
  });

  if (!res.ok) {
    const err = new Error(`patch_authed ${collection}/${id} ${res.status}`);
    throw Object.assign(err, { status: res.status === 403 ? 403 : 500 });
  }

  return res.json();
}

export async function patchFirestoreMediaBlurFlags(
  uid: string,
  flags: Record<string, boolean>,
  meta?: { adminBlurBy?: string; adminBlurAt?: string; idToken?: string },
) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/usuarios/${encodeURIComponent(uid)}`,
  );
  url.searchParams.set("key", FIRESTORE_API_KEY);
  url.searchParams.append("updateMask.fieldPaths", "mediaBlurFlags");
  if (meta?.adminBlurBy) url.searchParams.append("updateMask.fieldPaths", "adminBlurBy");
  if (meta?.adminBlurAt) url.searchParams.append("updateMask.fieldPaths", "adminBlurAt");

  const bodyFields: Record<string, unknown> = {
    mediaBlurFlags: toFirestoreMapValue(flags),
  };
  if (meta?.adminBlurBy) bodyFields.adminBlurBy = { stringValue: meta.adminBlurBy };
  if (meta?.adminBlurAt) bodyFields.adminBlurAt = { stringValue: meta.adminBlurAt };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = String(meta?.idToken || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers,
    cache: "no-store",
    body: JSON.stringify({ fields: bodyFields }),
  });

  if (!res.ok) {
    throw new Error(`patch usuarios/${uid} mediaBlurFlags ${res.status}`);
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

export async function deleteFirestoreDocAuthed(idToken: string, collection: string, id: string) {
  const token = String(idToken || "").trim();
  if (!token) {
    throw Object.assign(new Error("missing_id_token"), { status: 401 });
  }
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?key=${FIRESTORE_API_KEY}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw Object.assign(new Error(`delete_authed ${collection}/${id} ${res.status}`), {
      status: res.status === 403 ? 403 : 500,
    });
  }
}
