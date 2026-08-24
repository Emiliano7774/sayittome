import {
  getFirestoreDoc,
  runFilteredCollectionQueryAll,
} from "@/lib/firestore/rest";
import {
  chatBelongsToProfile,
  MODERATION_OWNER_UID_FIELDS,
  normalizeModerationChatRow,
  serializeModerationChatForApi,
  timestampMs,
} from "@/lib/moderation/chatHistory";
import type { ModerationChatRow } from "@/lib/moderation/types";

const USERNAME_FIELDS = ["targetUsername", "receptorUsername"] as const;

function rowFromAdminDoc(id: string, data: Record<string, unknown>) {
  return { id, ...data };
}

function finalizeChats(merged: Map<string, Record<string, unknown>>, scanned: number, uid: string) {
  const chats = [...merged.values()]
    .map((row) => normalizeModerationChatRow(row))
    .sort((a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt))
    .map((chat) => serializeModerationChatForApi(chat));

  return { uid, chats, scanned };
}

function mergeOwnedRows(
  batches: Record<string, unknown>[][],
  username: string,
  uid: string,
  merged: Map<string, Record<string, unknown>>,
) {
  let scanned = 0;
  for (const batch of batches) {
    scanned += batch.length;
    for (const row of batch) {
      if (!chatBelongsToProfile(row, username, uid)) continue;
      const id = String(row.id || "");
      if (!id) continue;
      merged.set(id, row);
    }
  }
  return scanned;
}

async function resolveProfileUidExactAdmin(username: string) {
  const clean = String(username || "").trim();
  if (!clean) return "";
  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const db = getRepairAdminDb();
  const lower = clean.toLowerCase();
  const lookups: Array<[string, string]> = [["username", clean]];
  if (lower !== clean) lookups.push(["username", lower]);
  lookups.push(["usernameLower", lower]);

  for (const [field, value] of lookups) {
    const snap = await db.collection("usuarios").where(field, "==", value).limit(3).get();
    if (snap.size > 1) {
      throw Object.assign(new Error("username_not_unique"), { status: 409 });
    }
    if (snap.docs[0]?.id) return snap.docs[0].id;
  }
  return "";
}

async function resolveProfileUidExactRest(username: string) {
  const clean = String(username || "").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  const lookups: Array<[string, string]> = [["username", clean]];
  if (lower !== clean) lookups.push(["username", lower]);
  lookups.push(["usernameLower", lower]);

  for (const [field, value] of lookups) {
    try {
      const rows = await runFilteredCollectionQueryAll(
        "usuarios",
        field,
        value,
        undefined,
        "DESCENDING",
        3,
        3,
      );
      if (rows.length > 1) {
        throw Object.assign(new Error("username_not_unique"), { status: 409 });
      }
      if (rows[0]?.id) return String(rows[0].id);
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 0);
      if (status === 409) throw error;
    }
  }

  try {
    const profile = await getFirestoreDoc("usuarios", clean);
    if (profile?.id) return String(profile.id);
  } catch {
    // ignore
  }

  return "";
}

async function collectFilteredChatsAdmin(field: string, value: string) {
  if (!value) return [] as Record<string, unknown>[];

  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const db = getRepairAdminDb();
  try {
    const snap = await db
      .collection("chats")
      .where(field, "==", value)
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get();
    return snap.docs.map((docSnap: { id: string; data: () => Record<string, unknown> }) =>
      rowFromAdminDoc(docSnap.id, docSnap.data()),
    );
  } catch {
    try {
      const snap = await db.collection("chats").where(field, "==", value).limit(200).get();
      return snap.docs.map((docSnap: { id: string; data: () => Record<string, unknown> }) =>
        rowFromAdminDoc(docSnap.id, docSnap.data()),
      );
    } catch {
      return [];
    }
  }
}

async function collectFilteredChatsRest(field: string, value: string) {
  if (!value) return [] as Record<string, unknown>[];

  try {
    return await runFilteredCollectionQueryAll(
      "chats",
      field,
      value,
      "updatedAt",
      "DESCENDING",
      200,
      Number.MAX_SAFE_INTEGER,
    );
  } catch {
    try {
      return await runFilteredCollectionQueryAll(
        "chats",
        field,
        value,
        undefined,
        "DESCENDING",
        200,
        Number.MAX_SAFE_INTEGER,
      );
    } catch {
      return [];
    }
  }
}

function buildChatQueries(
  clean: string,
  uid: string,
  collect: (field: string, value: string) => Promise<Record<string, unknown>[]>,
) {
  const queries: Array<Promise<Record<string, unknown>[]>> = [
    collect("targetUsername", clean),
    collect("receptorUsername", clean),
  ];

  const lower = clean.toLowerCase();
  if (lower !== clean) {
    for (const field of USERNAME_FIELDS) {
      queries.push(collect(field, lower));
    }
  }

  if (uid) {
    for (const field of MODERATION_OWNER_UID_FIELDS) {
      queries.push(collect(field, uid));
    }
  }

  return queries;
}

async function fetchViaAdmin(clean: string) {
  const uid = await resolveProfileUidExactAdmin(clean);
  const merged = new Map<string, Record<string, unknown>>();
  const batches = await Promise.all(buildChatQueries(clean, uid, collectFilteredChatsAdmin));
  const scanned = mergeOwnedRows(batches, clean, uid, merged);
  return finalizeChats(merged, scanned, uid);
}

async function fetchViaRest(clean: string) {
  const uid = await resolveProfileUidExactRest(clean);
  const merged = new Map<string, Record<string, unknown>>();
  const batches = await Promise.all(buildChatQueries(clean, uid, collectFilteredChatsRest));
  const scanned = mergeOwnedRows(batches, clean, uid, merged);
  return finalizeChats(merged, scanned, uid);
}

function isHardConflict(error: unknown) {
  return Number((error as { status?: number })?.status || 0) === 409;
}

export async function fetchAllModerationChatsForUser(username: string) {
  const clean = String(username || "").trim();
  if (!clean) {
    return { uid: "", chats: [] as ModerationChatRow[], scanned: 0 };
  }

  try {
    return await fetchViaAdmin(clean);
  } catch (adminError) {
    if (isHardConflict(adminError)) throw adminError;
    try {
      return await fetchViaRest(clean);
    } catch (restError) {
      if (isHardConflict(restError)) throw restError;
      const adminStatus = Number((adminError as { status?: number })?.status || 0);
      if (adminStatus === 503) throw adminError;
      throw Object.assign(new Error("datastore_unavailable"), { status: 503 });
    }
  }
}

export async function fetchProfileUidByUsername(username: string) {
  const clean = String(username || "").trim();
  if (!clean) return "";
  try {
    return await resolveProfileUidExactAdmin(clean);
  } catch (adminError) {
    if (isHardConflict(adminError)) throw adminError;
    return resolveProfileUidExactRest(clean);
  }
}
