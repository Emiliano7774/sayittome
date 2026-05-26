import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

function pickNewer(
  a?: { updatedAt?: Timestamp; lastMessage?: string },
  b?: { updatedAt?: Timestamp; lastMessage?: string },
) {
  const aMs = a?.updatedAt?.toMillis?.() ?? 0;
  const bMs = b?.updatedAt?.toMillis?.() ?? 0;
  return bMs >= aMs ? b : a;
}

export async function migrateToCanonicalChat(
  canonicalId: string,
  legacyIds: string[],
  meta: DocumentData,
) {
  const uniqueLegacy = legacyIds.filter((id) => id && id !== canonicalId);
  if (uniqueLegacy.length === 0) {
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

  await setDoc(doc(db, "chats", canonicalId), mergedMeta, { merge: true });
  return canonicalId;
}
