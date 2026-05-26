import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { buildAbuseFingerprint } from "@/lib/abuse/fingerprint";

export const DEFAULT_ABUSE_BLOCK_MINUTES = 30;

export type AbuseBlockRecord = {
  id: string;
  receptorUid: string;
  blockedFingerprint: string;
  blockedAnonId?: string;
  blockedVisitorId?: string;
  motivo?: string;
  createdAt?: unknown;
  expiresAt?: unknown;
  chatId?: string;
  blockedBy?: string;
};

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof (value as Timestamp).toMillis === "function") {
    return (value as Timestamp).toMillis();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function isAbuseBlockActive(block: AbuseBlockRecord, now = Date.now()) {
  const expiresAt = toMillis(block.expiresAt);
  if (!expiresAt) return true;
  return expiresAt > now;
}

export async function createAnonAbuseBlock(input: {
  receptorUid: string;
  blockedAnonId: string;
  blockedVisitorId: string;
  chatId: string;
  motivo: string;
  blockedBy: string;
  durationMinutes?: number;
}) {
  const durationMinutes = input.durationMinutes ?? DEFAULT_ABUSE_BLOCK_MINUTES;
  const blockedFingerprint = buildAbuseFingerprint(
    input.blockedAnonId,
    input.blockedVisitorId,
  );

  const expiresAt = Timestamp.fromMillis(Date.now() + durationMinutes * 60 * 1000);
  const id = `${input.receptorUid}_${blockedFingerprint.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120)}`;

  await setDoc(
    doc(db, "anon_abuse_blocks", id),
    {
      receptorUid: input.receptorUid,
      blockedFingerprint,
      blockedAnonId: input.blockedAnonId,
      blockedVisitorId: input.blockedVisitorId,
      motivo: input.motivo,
      createdAt: serverTimestamp(),
      expiresAt,
      chatId: input.chatId,
      blockedBy: input.blockedBy,
    },
    { merge: true },
  );

  return { id, blockedFingerprint, expiresAt };
}

export async function findActiveAbuseBlock(input: {
  receptorUid: string;
  blockedAnonId: string;
  blockedVisitorId: string;
}) {
  const fingerprint = buildAbuseFingerprint(
    input.blockedAnonId,
    input.blockedVisitorId,
  );

  const q = query(
    collection(db, "anon_abuse_blocks"),
    where("receptorUid", "==", input.receptorUid),
    where("blockedFingerprint", "==", fingerprint),
  );

  const snap = await getDocs(q);
  const now = Date.now();

  for (const row of snap.docs) {
    const data = { id: row.id, ...(row.data() as Omit<AbuseBlockRecord, "id">) };
    if (isAbuseBlockActive(data, now)) {
      return data as AbuseBlockRecord;
    }
  }

  return null;
}

export async function listAbuseBlocksForReceptor(receptorUid: string, limit = 100) {
  const q = query(
    collection(db, "anon_abuse_blocks"),
    where("receptorUid", "==", receptorUid),
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((row) => ({ id: row.id, ...(row.data() as Omit<AbuseBlockRecord, "id">) }))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .slice(0, limit) as AbuseBlockRecord[];
}

export async function removeAbuseBlock(blockId: string) {
  await deleteDoc(doc(db, "anon_abuse_blocks", blockId));
}

export async function extendAbuseBlock(blockId: string, extraMinutes: number) {
  const expiresAt = Timestamp.fromMillis(Date.now() + extraMinutes * 60 * 1000);

  await setDoc(
    doc(db, "anon_abuse_blocks", blockId),
    {
      expiresAt,
    },
    { merge: true },
  );
}
