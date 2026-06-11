import { ANON_TO_MARKER, safeChatPart } from "@/lib/chat/anonChatId";
import {
  getFirestoreDoc,
  runCollectionQueryAll,
  runFilteredCollectionQueryAll,
} from "@/lib/firestore/rest";
import {
  chatBelongsToProfile,
  normalizeModerationChatRow,
  serializeModerationChatForApi,
  timestampMs,
} from "@/lib/moderation/chatHistory";
import type { ModerationChatRow } from "@/lib/moderation/types";

const UID_FIELDS = ["receptorUid", "targetUid", "initiatorUid", "anonOwnerUid"] as const;

async function resolveProfileUid(username: string) {
  const clean = String(username || "").trim();
  if (!clean) return "";

  const lookups = [clean, clean.toLowerCase()];
  for (const value of lookups) {
    try {
      const byUsername = await runFilteredCollectionQueryAll(
        "usuarios",
        "username",
        value,
        undefined,
        "DESCENDING",
        3,
        1,
      );
      if (byUsername[0]?.id) return String(byUsername[0].id);
    } catch {
      // try next field
    }

    try {
      const byLower = await runFilteredCollectionQueryAll(
        "usuarios",
        "usernameLower",
        value.toLowerCase(),
        undefined,
        "DESCENDING",
        3,
        1,
      );
      if (byLower[0]?.id) return String(byLower[0].id);
    } catch {
      // try next field
    }
  }

  return "";
}

async function collectFilteredChats(field: string, value: string) {
  if (!value) return [] as Record<string, unknown>[];

  try {
    return await runFilteredCollectionQueryAll(
      "chats",
      field,
      value,
      "updatedAt",
      "DESCENDING",
      300,
      50,
    );
  } catch {
    try {
      return await runFilteredCollectionQueryAll(
        "chats",
        field,
        value,
        undefined,
        "DESCENDING",
        300,
        50,
      );
    } catch {
      return [];
    }
  }
}

async function collectAnonChatsByUsername(username: string) {
  const marker = `${ANON_TO_MARKER}${safeChatPart(username)}`;
  const rows: Record<string, unknown>[] = [];

  try {
    const all = await runCollectionQueryAll("chats", "updatedAt", "DESCENDING", 500, 30);
    for (const chat of all) {
      if (String(chat.id || "").includes(marker)) {
        rows.push(chat);
      }
    }
  } catch {
    // Ignore scan failures.
  }

  return rows;
}

export async function fetchAllModerationChatsForUser(username: string) {
  const clean = String(username || "").trim();
  if (!clean) {
    return { uid: "", chats: [] as ModerationChatRow[], scanned: 0 };
  }

  const uid = await resolveProfileUid(clean);
  const merged = new Map<string, Record<string, unknown>>();

  const queries: Array<Promise<Record<string, unknown>[]>> = [
    collectFilteredChats("targetUsername", clean),
    collectFilteredChats("receptorUsername", clean),
  ];

  if (clean.toLowerCase() !== clean) {
    queries.push(collectFilteredChats("targetUsername", clean.toLowerCase()));
    queries.push(collectFilteredChats("receptorUsername", clean.toLowerCase()));
  }

  for (const field of UID_FIELDS) {
    if (uid) queries.push(collectFilteredChats(field, uid));
  }

  queries.push(collectAnonChatsByUsername(clean));

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

  const fromIndex = await resolveProfileUid(clean);
  if (fromIndex) return fromIndex;

  try {
    const profile = await getFirestoreDoc("usuarios", clean);
    if (profile?.id) return String(profile.id);
  } catch {
    // ignore
  }

  return "";
}
