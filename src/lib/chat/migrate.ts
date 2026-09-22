import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { isProfileAnonChatId } from "@/lib/chat/anonChatId";

const LOCKED_CHAT_IDENTITY_KEYS = ["receptorUid", "targetUid", "anonOwnerUid"] as const;

function withoutLockedChatIdentity(meta: DocumentData) {
  const next = { ...meta };
  for (const key of LOCKED_CHAT_IDENTITY_KEYS) delete next[key];
  return next;
}

function pickNewer(
  a?: { updatedAt?: Timestamp; lastMessage?: string },
  b?: { updatedAt?: Timestamp; lastMessage?: string },
) {
  const aMs = a?.updatedAt?.toMillis?.() ?? 0;
  const bMs = b?.updatedAt?.toMillis?.() ?? 0;
  return bMs >= aMs ? b : a;
}

export async function chatHasActivity(chatId: string) {
  const snap = await getDoc(doc(db, "chats", chatId));
  if (!snap.exists()) return false;
  if (String(snap.data()?.lastMessage || "").trim()) return true;

  const msgs = await getDocs(
    query(collection(db, "chats", chatId, "mensajes"), limit(1)),
  );
  return !msgs.empty;
}

export async function deleteEmptyChatIfIdle(chatId: string) {
  if (!chatId) return;
  // Profile-anon shells are created by the server lease. Client delete is
  // denied and would race the first message commit.
  if (isProfileAnonChatId(chatId)) return;
  if (await chatHasActivity(chatId)) return;

  try {
    await deleteDoc(doc(db, "chats", chatId));
  } catch (e) {
    console.error("delete empty chat", chatId, e);
  }
}

/** Migrate legacy ids only when a real conversation already exists. Never creates empty chats. */
export async function maybeMigrateExistingProfileChat(
  canonicalId: string,
  legacyIds: string[],
  meta: DocumentData,
) {
  const candidates = Array.from(
    new Set([canonicalId, ...legacyIds.filter((id) => id && id !== canonicalId)]),
  );

  const activeIds: string[] = [];
  const emptyIds: string[] = [];

  for (const id of candidates) {
    const snap = await getDoc(doc(db, "chats", id));
    if (!snap.exists()) continue;

    if (await chatHasActivity(id)) {
      activeIds.push(id);
    } else {
      emptyIds.push(id);
    }
  }

  for (const id of emptyIds) {
    if (isProfileAnonChatId(id)) continue;
    try {
      await deleteDoc(doc(db, "chats", id));
    } catch (e) {
      console.error("delete empty chat shell", id, e);
    }
  }

  if (activeIds.length === 0) return canonicalId;

  const migrateLegacy = Array.from(
    new Set([
      ...legacyIds.filter((id) => id && id !== canonicalId),
      ...activeIds.filter((id) => id !== canonicalId),
    ]),
  );

  return migrateToCanonicalChat(canonicalId, migrateLegacy, meta);
}

export async function migrateToCanonicalChat(
  canonicalId: string,
  legacyIds: string[],
  meta: DocumentData,
) {
  const uniqueLegacy = legacyIds.filter((id) => id && id !== canonicalId);
  if (uniqueLegacy.length === 0) {
    const existing = await getDoc(doc(db, "chats", canonicalId));
    if (existing.exists()) {
      const payload = isProfileAnonChatId(canonicalId) ? withoutLockedChatIdentity(meta) : meta;
      await setDoc(doc(db, "chats", canonicalId), payload, { merge: true });
      return canonicalId;
    }
    // Profile-anon only: never pre-create empty shells — server bind owns first create.
    if (isProfileAnonChatId(canonicalId)) {
      return canonicalId;
    }
    await setDoc(doc(db, "chats", canonicalId), meta, { merge: true });
    return canonicalId;
  }

  let mergedMeta: DocumentData = { ...meta, id: canonicalId, canonicalChatId: canonicalId };

  for (const legacyId of uniqueLegacy) {
    const legacyRef = doc(db, "chats", legacyId);
    const legacySnap = await getDoc(legacyRef);
    if (!legacySnap.exists()) continue;

    const legacyData = legacySnap.data() as DocumentData;
    mergedMeta = {
      ...mergedMeta,
      ...legacyData,
      ...meta,
      id: canonicalId,
      canonicalChatId: canonicalId,
      migratedFrom: Array.from(
        new Set([...(mergedMeta.migratedFrom || []), legacyId]),
      ),
      participantes: Array.from(
        new Set([
          ...(Array.isArray(mergedMeta.participantes) ? mergedMeta.participantes : []),
          ...(Array.isArray(legacyData.participantes) ? legacyData.participantes : []),
          ...(Array.isArray(meta.participantes) ? meta.participantes : []),
        ]),
      ),
    };

    const newer = pickNewer(legacyData, mergedMeta);
    if (newer?.lastMessage) mergedMeta.lastMessage = newer.lastMessage;
    if (newer?.updatedAt) mergedMeta.updatedAt = newer.updatedAt;

    const msgsSnap = await getDocs(collection(db, "chats", legacyId, "mensajes"));
    for (const msgDoc of msgsSnap.docs) {
      await setDoc(
        doc(db, "chats", canonicalId, "mensajes", msgDoc.id),
        msgDoc.data(),
        { merge: true },
      );
    }

    try {
      await deleteDoc(legacyRef);
    } catch (e) {
      console.error("migrate delete legacy chat", legacyId, e);
    }
  }

  const canonicalPayload = isProfileAnonChatId(canonicalId)
    ? withoutLockedChatIdentity(mergedMeta)
    : mergedMeta;
  await setDoc(doc(db, "chats", canonicalId), canonicalPayload, { merge: true });
  return canonicalId;
}
