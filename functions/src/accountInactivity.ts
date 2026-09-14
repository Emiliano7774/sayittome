import { createHash } from "crypto";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Query,
} from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { logger } from "firebase-functions";

import { db, ensureAdminApp, storage } from "./adminApp";
import {
  inactivityDecision,
  nextInactivityCheckpointMs,
  resolveLastActivityMs,
} from "./accountInactivityCore";

export const INACTIVITY_SCHEDULE_COLLECTION = "account_inactivity_schedules";
export const INACTIVITY_TASK_FUNCTION = "accountInactivityCheck";

const QUERY_BATCH = 200;
const DELETE_BATCH = 250;
const REPAIR_MAX_USERS = 5000;
type InactivityTaskPayload = {
  uid: string;
  expectedDueAtMs?: number;
};

type LoadedAccount = {
  uid: string;
  profile: Record<string, unknown>;
  profileExists: boolean;
  authUser: UserRecord | null;
};

function cleanUid(value: unknown) {
  return String(value || "").trim();
}

function taskId(uid: string, checkpointMs: number) {
  return createHash("sha256")
    .update(`${uid}:${checkpointMs}`)
    .digest("hex")
    .slice(0, 40);
}

function isNotFoundAuthError(error: unknown) {
  const code = String((error as { code?: string })?.code || "");
  return code === "auth/user-not-found";
}
async function loadAccount(uid: string): Promise<LoadedAccount> {
  const firestore = db();
  const profileSnap = await firestore.collection("usuarios").doc(uid).get();
  let authUser: UserRecord | null = null;
  try {
    authUser = await getAuth(ensureAdminApp()).getUser(uid);
  } catch (error) {
    if (!isNotFoundAuthError(error)) throw error;
  }

  return {
    uid,
    profile: profileSnap.exists ? profileSnap.data() || {} : {},
    profileExists: profileSnap.exists,
    authUser,
  };
}

function accountLastActivityMs(account: LoadedAccount) {
  return resolveLastActivityMs(account.profile, account.authUser?.metadata);
}

async function deleteRefs(refs: DocumentReference[]) {
  const firestore = db();
  for (let i = 0; i < refs.length; i += DELETE_BATCH) {
    const writer = firestore.bulkWriter();
    for (const ref of refs.slice(i, i + DELETE_BATCH)) writer.delete(ref);
    await writer.close();
  }
}
async function deleteQuery(query: Query) {
  for (;;) {
    const snap = await query.limit(QUERY_BATCH).get();
    if (snap.empty) return;
    await deleteRefs(snap.docs.map((row) => row.ref));
    if (snap.size < QUERY_BATCH) return;
  }
}

async function recursiveDeleteRefs(refs: DocumentReference[]) {
  const firestore = db();
  for (let i = 0; i < refs.length; i += 10) {
    await Promise.all(refs.slice(i, i + 10).map((ref) => firestore.recursiveDelete(ref)));
  }
}

async function recursiveDeleteQuery(query: Query) {
  for (;;) {
    const snap = await query.limit(50).get();
    if (snap.empty) return;
    await recursiveDeleteRefs(snap.docs.map((row) => row.ref));
    if (snap.size < 50) return;
  }
}

async function deleteStoragePrefix(prefix: string) {
  const clean = String(prefix || "").replace(/^\/+/, "");
  if (!clean) return;
  try {
    await storage().bucket().deleteFiles({ prefix: clean, force: true });
  } catch (error) {
    logger.warn("account inactivity storage cleanup failed", { prefix: clean, error });
  }
}
async function deleteStoryData(uid: string) {
  const firestore = db();
  await recursiveDeleteQuery(firestore.collection("historias").where("ownerUid", "==", uid));
  await deleteStoragePrefix(`historias/${uid}/`);
}

async function loadChatsForUid(uid: string) {
  const firestore = db();
  const chats = firestore.collection("chats");
  const queries = [
    chats.where("targetUid", "==", uid),
    chats.where("receptorUid", "==", uid),
    chats.where("anonOwnerUid", "==", uid),
    chats.where("initiatorUid", "==", uid),
    chats.where("participants", "array-contains", uid),
    chats.where("participantes", "array-contains", uid),
  ];
  const snaps = await Promise.all(queries.map((query) => query.get()));
  const refs = new Map<string, DocumentReference>();
  for (const snap of snaps) {
    for (const row of snap.docs) refs.set(row.id, row.ref);
  }

  const leaseSnap = await firestore
    .collection("anon_abuse_chat_leases")
    .where("visitorAuthUid", "==", uid)
    .get();
  for (const row of leaseSnap.docs) refs.set(row.id, chats.doc(row.id));
  return [...refs.values()];
}
async function deleteChatData(uid: string) {
  const firestore = db();
  const refs = await loadChatsForUid(uid);
  for (const ref of refs) {
    await Promise.all([
      deleteStoragePrefix(`chats/${ref.id}/`),
      deleteStoragePrefix(`chat_media/${ref.id}/`),
      deleteQuery(firestore.collection("viewOnceSecrets").where("chatId", "==", ref.id)),
      firestore.collection("chat_inbox_lite").doc(ref.id).delete().catch(() => undefined),
      firestore.collection("anon_abuse_chat_leases").doc(ref.id).delete().catch(() => undefined),
    ]);
  }
  await recursiveDeleteRefs(refs);
}

async function deleteDirectAnonData(uid: string) {
  const firestore = db();
  const chats = firestore.collection("chats_anonimos");
  const chatSnaps = await Promise.all([
    chats.where("solicitanteUid", "==", uid).get(),
    chats.where("destinatarioUid", "==", uid).get(),
  ]);
  const refs = new Map<string, DocumentReference>();
  for (const snap of chatSnaps) {
    for (const row of snap.docs) refs.set(row.id, row.ref);
  }
  for (const ref of refs.values()) {
    await deleteStoragePrefix(`chats_anonimos/${ref.id}/`);
  }
  await recursiveDeleteRefs([...refs.values()]);
  const requests = firestore.collection("solicitudes_chat_anonimo");
  await Promise.all([
    deleteQuery(requests.where("solicitanteUid", "==", uid)),
    deleteQuery(requests.where("destinatarioUid", "==", uid)),
  ]);
}

async function deleteTransientAbuseIdentity(uid: string) {
  const firestore = db();
  await Promise.all([
    deleteQuery(firestore.collection("anon_abuse_chat_leases").where("visitorAuthUid", "==", uid)),
    deleteQuery(firestore.collection("anon_abuse_chat_leases").where("receptorUid", "==", uid)),
    deleteQuery(firestore.collection("anon_abuse_anon_aliases").where("visitorAuthUid", "==", uid)),
    deleteQuery(firestore.collection("anon_abuse_send_permits").where("visitorAuthUid", "==", uid)),
    deleteQuery(firestore.collection("anon_abuse_send_permits").where("receptorUid", "==", uid)),
  ]);
}

async function deleteSocialEdges(uid: string) {
  const firestore = db();
  await Promise.all([
    deleteQuery(firestore.collection("perfil_likes").where("fromUid", "==", uid)),
    deleteQuery(firestore.collection("perfil_likes").where("targetUid", "==", uid)),
    deleteQuery(firestore.collectionGroup("likes_recibidos").where("fromUid", "==", uid)),
    deleteQuery(firestore.collectionGroup("siguiendo").where("seguidoUid", "==", uid)),
  ]);
}
async function deleteUserRoot(uid: string) {
  const firestore = db();
  await Promise.all([
    deleteStoragePrefix(`usuarios/${uid}/`),
    firestore.recursiveDelete(firestore.collection("usuarios").doc(uid)),
  ]);
}

async function enqueueCheckpoint(uid: string, dueAtMs: number, nowMs = Date.now()) {
  const checkpointMs = nextInactivityCheckpointMs({ dueAtMs, nowMs });
  if (!checkpointMs) return;

  const id = taskId(uid, checkpointMs);
  try {
    await getFunctions(ensureAdminApp())
      .taskQueue<InactivityTaskPayload>(INACTIVITY_TASK_FUNCTION)
      .enqueue(
        { uid, expectedDueAtMs: dueAtMs },
        { id, scheduleTime: new Date(checkpointMs), dispatchDeadlineSeconds: 900 },
      );
  } catch (error) {
    const code = String((error as { code?: string })?.code || "");
    if (!code.includes("task-already-exists")) throw error;
  }

  await db().collection(INACTIVITY_SCHEDULE_COLLECTION).doc(uid).set(
    {
      uid,
      dueAtMs,
      dueAt: Timestamp.fromMillis(dueAtMs),
      nextCheckAtMs: checkpointMs,
      nextCheckAt: Timestamp.fromMillis(checkpointMs),
      taskId: id,
      status: "scheduled",
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
export async function scheduleAccountInactivityForUid(uidInput: string, nowMs = Date.now()) {
  const uid = cleanUid(uidInput);
  if (!uid) return { ok: false as const, reason: "missing_uid" as const };

  const account = await loadAccount(uid);
  if (!account.profileExists && !account.authUser) {
    await db().collection(INACTIVITY_SCHEDULE_COLLECTION).doc(uid).delete().catch(() => undefined);
    return { ok: true as const, gone: true as const };
  }

  const lastActivityMs = accountLastActivityMs(account);
  if (!lastActivityMs) {
    logger.warn("account inactivity missing activity baseline", { uid });
    return { ok: false as const, reason: "missing_activity_baseline" as const };
  }

  const { dueAtMs } = inactivityDecision({ lastActivityMs, nowMs });
  await enqueueCheckpoint(uid, dueAtMs, nowMs);
  return { ok: true as const, gone: false as const, dueAtMs, lastActivityMs };
}

async function disableAuthForDeletion(uid: string) {
  try {
    const auth = getAuth(ensureAdminApp());
    await auth.updateUser(uid, { disabled: true });
    await auth.revokeRefreshTokens(uid);
    return true;
  } catch (error) {
    if (isNotFoundAuthError(error)) return false;
    throw error;
  }
}
async function deleteInactiveAccount(uid: string, dueAtMs: number) {
  const scheduleRef = db().collection(INACTIVITY_SCHEDULE_COLLECTION).doc(uid);
  await scheduleRef.set(
    {
      status: "deleting",
      dueAtMs,
      deletionStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await disableAuthForDeletion(uid);

  const afterDisable = await loadAccount(uid);
  if (afterDisable.profileExists || afterDisable.authUser) {
    const latestActivityMs = accountLastActivityMs(afterDisable);
    const latest = inactivityDecision({ lastActivityMs: latestActivityMs });
    if (latestActivityMs && !latest.expired) {
      if (afterDisable.authUser?.disabled) {
        await getAuth(ensureAdminApp()).updateUser(uid, { disabled: false }).catch(() => undefined);
      }
      await enqueueCheckpoint(uid, latest.dueAtMs);
      return { deleted: false as const, rescheduled: true as const, dueAtMs: latest.dueAtMs };
    }
  }

  await deleteStoryData(uid);
  await deleteChatData(uid);
  await deleteDirectAnonData(uid);
  await deleteSocialEdges(uid);
  await deleteTransientAbuseIdentity(uid);
  await deleteUserRoot(uid);
  try {
    await getAuth(ensureAdminApp()).deleteUser(uid);
  } catch (error) {
    if (!isNotFoundAuthError(error)) throw error;
  }

  await scheduleRef.delete().catch(() => undefined);
  logger.info("account deleted after inactivity", { uid, dueAtMs });
  return { deleted: true as const, rescheduled: false as const, dueAtMs };
}

export async function processAccountInactivityTask(
  payload: InactivityTaskPayload,
  nowMs = Date.now(),
) {
  const uid = cleanUid(payload?.uid);
  if (!uid) {
    logger.warn("account inactivity task missing uid");
    return { ok: false as const, reason: "missing_uid" as const };
  }

  const account = await loadAccount(uid);
  if (!account.profileExists && !account.authUser) {
    await db().collection(INACTIVITY_SCHEDULE_COLLECTION).doc(uid).delete().catch(() => undefined);
    return { ok: true as const, gone: true as const };
  }

  const lastActivityMs = accountLastActivityMs(account);
  const decision = inactivityDecision({ lastActivityMs, nowMs });
  if (!lastActivityMs || !decision.dueAtMs) {
    throw new Error("missing_activity_baseline");
  }
  if (!decision.expired) {
    await enqueueCheckpoint(uid, decision.dueAtMs, nowMs);
    return {
      ok: true as const,
      gone: false as const,
      deleted: false as const,
      dueAtMs: decision.dueAtMs,
    };
  }

  const result = await deleteInactiveAccount(uid, decision.dueAtMs);
  return { ok: true as const, gone: false as const, ...result };
}

export async function repairAccountInactivitySchedules(nowMs = Date.now()) {
  const firestore = db();
  let processed = 0;
  let lastId = "";

  while (processed < REPAIR_MAX_USERS) {
    let query = firestore
      .collection("usuarios")
      .orderBy(FieldPath.documentId())
      .limit(Math.min(200, REPAIR_MAX_USERS - processed));
    if (lastId) query = query.startAfter(lastId);

    const snap = await query.get();
    if (snap.empty) break;

    for (let i = 0; i < snap.docs.length; i += 20) {
      const batch = snap.docs.slice(i, i + 20);
      await Promise.all(
        batch.map((row) => scheduleAccountInactivityForUid(row.id, nowMs)),
      );
    }

    processed += snap.size;
    lastId = snap.docs[snap.docs.length - 1]?.id || "";
    if (snap.size < 200) break;
  }

  logger.info("account inactivity repair complete", { processed });
  return { processed };
}
