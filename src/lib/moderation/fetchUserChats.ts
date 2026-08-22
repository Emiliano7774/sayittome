import { getRepairAdminDb } from "@/lib/chat/historicalAuthorshipRepairAdmin";
import {
  chatBelongsToProfile,
  MODERATION_OWNER_UID_FIELDS,
  normalizeModerationChatRow,
  serializeModerationChatForApi,
  timestampMs,
} from "@/lib/moderation/chatHistory";
import type { ModerationChatRow } from "@/lib/moderation/types";

const USERNAME_FIELDS = ["targetUsername", "receptorUsername"] as const;

async function resolveProfileUidExact(username: string) {
  const clean = String(username || "").trim();
  if (!clean) return "";
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

function rowFromAdminDoc(id: string, data: Record<string, unknown>) {
  return { id, ...data };
}

async function collectFilteredChats(field: string, value: string) {
  if (!value) return [] as Record<string, unknown>[];

  const db = getRepairAdminDb();
  try {
    const snap = await db
      .collection("chats")
      .where(field, "==", value)
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get();
    return snap.docs.map((docSnap) =>
      rowFromAdminDoc(docSnap.id, docSnap.data() as Record<string, unknown>),
    );
  } catch {
    const snap = await db.collection("chats").where(field, "==", value).limit(200).get();
    return snap.docs.map((docSnap) =>
      rowFromAdminDoc(docSnap.id, docSnap.data() as Record<string, unknown>),
    );
  }
}

export async function fetchAllModerationChatsForUser(username: string) {
  const clean = String(username || "").trim();
  if (!clean) {
    return { uid: "", chats: [] as ModerationChatRow[], scanned: 0 };
  }

  const uid = await resolveProfileUidExact(clean);
  const merged = new Map<string, Record<string, unknown>>();

  const queries: Array<Promise<Record<string, unknown>[]>> = [
    collectFilteredChats("targetUsername", clean),
    collectFilteredChats("receptorUsername", clean),
  ];

  const lower = clean.toLowerCase();
  if (lower !== clean) {
    for (const field of USERNAME_FIELDS) {
      queries.push(collectFilteredChats(field, lower));
    }
  }

  if (uid) {
    for (const field of MODERATION_OWNER_UID_FIELDS) {
      queries.push(collectFilteredChats(field, uid));
    }
  }

  const batches = await Promise.all(queries);
  let scanned = 0;

  for (const batch of batches) {
    scanned += batch.length;
    for (const row of batch) {
      if (!chatBelongsToProfile(row, clean, uid)) continue;
      const id = String(row.id || "");
      if (!id) continue;
      merged.set(id, row);
    }
  }

  const chats = [...merged.values()]
    .map((row) => normalizeModerationChatRow(row))
    .sort((a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt))
    .map((chat) => serializeModerationChatForApi(chat));

  return { uid, chats, scanned };
}

export async function fetchProfileUidByUsername(username: string) {
  const clean = String(username || "").trim();
  if (!clean) return "";
  return resolveProfileUidExact(clean);
}
