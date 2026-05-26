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
import { buildAbuseFingerprint, buildVisitorBlockKey } from "@/lib/abuse/fingerprint";

export const DEFAULT_ABUSE_BLOCK_MINUTES = 30;

export type AbuseBlockRecord = {
  id: string;
  receptorUid: string;
  blockedFingerprint: string;
  blockedAnonId?: string;
  blockedVisitorId?: string;
  blockedClientIp?: string;
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

function blockDocId(receptorUid: string, blockedVisitorId: string) {
  const safeVisitor = blockedVisitorId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  return `${receptorUid}__vis__${safeVisitor}`;
}

export async function createAnonAbuseBlock(input: {
  receptorUid: string;
  blockedAnonId: string;
  blockedVisitorId: string;
  chatId: string;
  motivo: string;
  blockedBy: string;
  durationMinutes?: number;
  blockedClientIp?: string;
}) {
  const durationMinutes = input.durationMinutes ?? DEFAULT_ABUSE_BLOCK_MINUTES;
  const blockedVisitorId = input.blockedVisitorId;
  const blockedFingerprint = buildVisitorBlockKey(blockedVisitorId);
  const legacyFingerprint = buildAbuseFingerprint(
    input.blockedAnonId,
    blockedVisitorId,
  );

  const expiresAt = Timestamp.fromMillis(Date.now() + durationMinutes * 60 * 1000);
  const id = blockDocId(input.receptorUid, blockedVisitorId);

  await setDoc(
    doc(db, "anon_abuse_blocks", id),
    {
      receptorUid: input.receptorUid,
      blockedFingerprint,
      legacyFingerprint,
      blockedAnonId: input.blockedAnonId,
      blockedVisitorId,
      blockedClientIp: input.blockedClientIp || null,
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

async function findActiveInQuery(
  rows: Array<{ id: string; data: () => Record<string, unknown> }>,
  now: number,
) {
  for (const row of rows) {
    const data = {
      id: row.id,
      ...(row.data() as Omit<AbuseBlockRecord, "id">),
    } as AbuseBlockRecord;

    if (isAbuseBlockActive(data, now)) {
      return data;
    }
  }

  return null;
}

export async function findActiveAbuseBlock(input: {
  receptorUid: string;
  blockedAnonId: string;
  blockedVisitorId: string;
  blockedClientIp?: string;
}) {
  const now = Date.now();

  const byVisitor = query(
    collection(db, "anon_abuse_blocks"),
    where("receptorUid", "==", input.receptorUid),
    where("blockedVisitorId", "==", input.blockedVisitorId),
  );

  const visitorSnap = await getDocs(byVisitor);
  const visitorHit = await findActiveInQuery(visitorSnap.docs, now);
  if (visitorHit) return visitorHit;

  if (input.blockedClientIp) {
    const byIp = query(
      collection(db, "anon_abuse_blocks"),
      where("receptorUid", "==", input.receptorUid),
      where("blockedClientIp", "==", input.blockedClientIp),
    );

    const ipSnap = await getDocs(byIp);
    const ipHit = await findActiveInQuery(ipSnap.docs, now);
    if (ipHit) return ipHit;
  }

  const fingerprint = buildAbuseFingerprint(
    input.blockedAnonId,
    input.blockedVisitorId,
  );

  const byFingerprint = query(
    collection(db, "anon_abuse_blocks"),
    where("receptorUid", "==", input.receptorUid),
    where("blockedFingerprint", "==", fingerprint),
  );

  const fingerprintSnap = await getDocs(byFingerprint);
  return findActiveInQuery(fingerprintSnap.docs, now);
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

export function getRequestClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "";
  }

  return req.headers.get("x-real-ip")?.trim() || "";
}
