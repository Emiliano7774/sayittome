import {
  FieldPath,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import { usernameHintFromAnonChatId } from "@/lib/chat/anonChatId";
import {
  getRepairAdminDb,
  lookupUniqueProfileUidByUsernameAdmin,
} from "@/lib/chat/historicalAuthorshipRepairAdmin";
import {
  persistedAuthorFromDoc,
  resolveThreadIdentities,
  type RepairMessageInput,
  type ThreadIdentities,
} from "@/lib/chat/historicalAuthorshipRepair";
import {
  canonicalFirestoreUpdateTime,
  compareRepairMessagesChronological,
  HISTORICAL_REPAIR_PAGE_SIZE,
  messageCollectionPath,
  paginateFullSubcollection,
  shouldIncludeDocMissingCreatedAt,
} from "@/lib/chat/historicalRepairSafety";
const MESSAGE_COLLECTIONS = ["mensajes", "messages"] as const;

export type ListedMensajeDoc = Record<string, unknown> & {
  id: string;
  createdAt?: string;
  _firestoreUpdateTime?: string;
  _firestoreCreateTime?: string;
  _legacyCollection?: string;
  collectionName?: "mensajes" | "messages";
  collectionPath?: string;
};

function createdAtIso(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "object" && value && "toDate" in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return "";
    }
  }
  return String(value);
}

function snapToListed(
  snap: QueryDocumentSnapshot | DocumentSnapshot,
  legacy = "",
  chatId = "",
) {
  const data = (snap.data() || {}) as Record<string, unknown>;
  const collectionName = collectionNameOf(legacy);
  return {
    ...data,
    id: snap.id,
    createdAt: createdAtIso(data.createdAt) || undefined,
    _createdAtRaw: data.createdAt,
    _firestoreUpdateTime: canonicalFirestoreUpdateTime(snap.updateTime),
    _firestoreCreateTime: canonicalFirestoreUpdateTime(snap.createTime),
    _legacyCollection: legacy,
    collectionName,
    collectionPath: chatId ? messageCollectionPath(chatId, collectionName, snap.id) : undefined,
  } as ListedMensajeDoc;
}

function collectionNameOf(legacy: string): "mensajes" | "messages" {
  return legacy === "legacy" ? "messages" : "mensajes";
}

export async function listMensajesPage(
  chatId: string,
  pageToken = "",
  pageSize = HISTORICAL_REPAIR_PAGE_SIZE,
  collectionName: (typeof MESSAGE_COLLECTIONS)[number] = "mensajes",
): Promise<{ docs: ListedMensajeDoc[]; nextPageToken: string }> {
  const db = getRepairAdminDb();
  let query = db
    .collection("chats")
    .doc(chatId)
    .collection(collectionName)
    .orderBy(FieldPath.documentId())
    .limit(pageSize);
  if (pageToken) query = query.startAfter(pageToken);
  const snap = await query.get();
  const docs = snap.docs.map((doc) =>
    snapToListed(doc, collectionName === "messages" ? "legacy" : "", chatId),
  );
  const nextPageToken =
    snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1]?.id || "" : "";
  return { docs, nextPageToken };
}

export async function rereadMensajesByIds(
  chatId: string,
  ids: string[],
  collectionName?: (typeof MESSAGE_COLLECTIONS)[number],
): Promise<ListedMensajeDoc[]> {
  const db = getRepairAdminDb();
  const clean = ids.map((id) => String(id || "").trim()).filter(Boolean);
  const out: ListedMensajeDoc[] = [];
  const collections = collectionName ? [collectionName] : MESSAGE_COLLECTIONS;
  for (const collectionName of collections) {
    const refs = clean.map((id) =>
      db.collection("chats").doc(chatId).collection(collectionName).doc(id),
    );
    if (refs.length === 0) continue;
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      out.push(snapToListed(snap, collectionName === "messages" ? "legacy" : "", chatId));
    }
  }
  return out;
}

export function toRepairMessageInput(doc: ListedMensajeDoc): RepairMessageInput {
  return {
    id: String(doc.id || ""),
    text: String(doc.texto || doc.text || ""),
    createdAt: String(doc.createdAt || ""),
    createTime: String(doc._firestoreCreateTime || ""),
    updateTime: String(doc._firestoreUpdateTime || ""),
    collectionName: doc.collectionName === "messages" ? "messages" : "mensajes",
    collectionPath: String(doc.collectionPath || ""),
    persisted: persistedAuthorFromDoc(doc),
  };
}

export async function listChatMensajes(chatId: string): Promise<RepairMessageInput[]> {
  const seen = new Set<string>();
  const merged: ListedMensajeDoc[] = [];
  for (const collectionName of MESSAGE_COLLECTIONS) {
    const docs = await paginateFullSubcollection({
      pageSize: HISTORICAL_REPAIR_PAGE_SIZE,
      listPage: (pageToken) =>
        listMensajesPage(chatId, pageToken, HISTORICAL_REPAIR_PAGE_SIZE, collectionName),
      rereadByIds: (ids) => rereadMensajesByIds(chatId, ids, collectionName),
    });
    for (const doc of docs) {
      const key = String(doc.collectionPath || `${doc.collectionName || collectionName}:${doc.id}`);
      if (!doc.id || seen.has(key) || !shouldIncludeDocMissingCreatedAt()) continue;
      seen.add(key);
      merged.push(doc);
    }
  }
  merged.sort((a, b) =>
    compareRepairMessagesChronological(
      {
        id: a.id,
        createdAt: a._createdAtRaw ?? a.createdAt,
        createTime: a._firestoreCreateTime,
      },
      {
        id: b.id,
        createdAt: b._createdAtRaw ?? b.createdAt,
        createTime: b._firestoreCreateTime,
      },
    ),
  );
  return merged.map(toRepairMessageInput);
}

export async function loadRepairChatSnapshot(chatId: string) {
  const db = getRepairAdminDb();
  const snap = await db.collection("chats").doc(chatId).get();
  const raw = (snap.data() || {}) as Record<string, unknown>;
  return {
    latestMessageId: String(raw.latestMessageId || ""),
    latestCollectionPath: String(raw.latestCollectionPath || ""),
    lastMessageSender: String(raw.lastMessageSender || ""),
    latestSenderKind: String(raw.latestSenderKind || ""),
    latestSenderAnonSessionId: String(raw.latestSenderAnonSessionId || ""),
    readBy: (raw.readBy && typeof raw.readBy === "object" ? raw.readBy : {}) as Record<
      string,
      unknown
    >,
    unreadCounts: (raw.unreadCounts && typeof raw.unreadCounts === "object"
      ? raw.unreadCounts
      : {}) as Record<string, unknown>,
    updateTime: canonicalFirestoreUpdateTime(snap.updateTime),
    receptorUid: String(raw.receptorUid || "").trim(),
    anonOwnerUid: String(raw.anonOwnerUid || "").trim(),
    raw,
    exists: snap.exists,
  };
}

export async function loadRepairMessageDocs(
  chatId: string,
  rows: Array<{ id: string; collectionName?: "mensajes" | "messages"; collectionPath?: string }>,
) {
  const out: Record<string, Record<string, unknown>> = {};
  for (const collectionName of MESSAGE_COLLECTIONS) {
    const ids = rows
      .filter((row) => (row.collectionName || "mensajes") === collectionName)
      .map((row) => row.id);
    const docs = await rereadMensajesByIds(chatId, ids, collectionName);
    for (const doc of docs) {
      const key = String(doc.collectionPath || "");
      if (key) out[key] = doc;
    }
  }
  return out;
}

export async function loadRepairThread(chatId: string): Promise<{
  identities: ThreadIdentities;
  messages: RepairMessageInput[];
}> {
  const chat = await loadRepairChatSnapshot(chatId);
  const slug =
    usernameHintFromAnonChatId(chatId) ||
    String(chat.raw?.receptorUsername || chat.raw?.targetUsername || "").trim();
  let ownerProfileIdFromUsername = "";
  if (slug) {
    const looked = await lookupUniqueProfileUidByUsernameAdmin(slug);
    if (!looked.ok) {
      throw Object.assign(new Error(looked.error), { status: 409 });
    }
    ownerProfileIdFromUsername = looked.uid;
  }

  const identities = resolveThreadIdentities({
    chatId,
    ownerProfileIdFromUsername,
    receptorUid: chat.receptorUid,
    anonOwnerUid: chat.anonOwnerUid,
    targetUid: String(chat.raw?.targetUid || ""),
  });

  const messages = await listChatMensajes(chatId);
  return { identities, messages };
}
