import { randomBytes } from "node:crypto";

import type { AbuseAdminTx } from "@/lib/abuse/abuseAdminTypes";
import {
  ANON_MATCH_ALIAS_COLLECTION,
  ANON_MATCH_AUTH_SESSION_COLLECTION,
  isAnonMatchSessionAlias,
} from "@/lib/anonMatch/anonMatchAliasBinding";

export type ServerAnonMatchAliasIssue = {
  anonId: string;
  created: boolean;
  rotated: boolean;
};

async function getAdminDb() {
  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  return getRepairAdminDb();
}

export function mintServerAnonMatchAlias(nowMs = Date.now()) {
  const rand = randomBytes(12).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  return `anon_${rand}_${nowMs.toString(36)}`;
}

export async function lookupAnonMatchAliasBinding(anonId: string): Promise<string | null> {
  const db = await getAdminDb();
  const snap = await db.collection(ANON_MATCH_ALIAS_COLLECTION).doc(anonId).get();
  if (!snap.exists) return null;
  const bound = String((snap.data() || {}).visitorAuthUid || "").trim();
  return bound || null;
}

export async function lookupActiveAnonMatchAliasForAuth(authUid: string): Promise<string | null> {
  const uid = String(authUid || "").trim();
  if (!uid) return null;
  const db = await getAdminDb();
  const snap = await db.collection(ANON_MATCH_AUTH_SESSION_COLLECTION).doc(uid).get();
  if (!snap.exists) return null;
  const active = String((snap.data() || {}).activeAnonId || "").trim();
  return active || null;
}

/**
 * Server generates alias, binds atomically to auth.uid.
 * Idempotent retry (rotate=false) returns the same active alias.
 * rotate=true issues a new alias; old alias stays bound for existing threads.
 */
export async function issueServerAnonMatchAlias(input: {
  authUid: string;
  rotate?: boolean;
  nowMs?: number;
}): Promise<ServerAnonMatchAliasIssue> {
  const uid = String(input.authUid || "").trim();
  if (!uid) {
    throw Object.assign(new Error("unauthenticated"), { status: 401 });
  }

  const db = await getAdminDb();
  const sessionRef = db.collection(ANON_MATCH_AUTH_SESSION_COLLECTION).doc(uid);
  const nowMs = Number(input.nowMs || Date.now());
  const rotate = input.rotate === true;

  return db.runTransaction(async (tx: AbuseAdminTx) => {
    const sessionSnap = await tx.get(sessionRef);
    const sessionData = sessionSnap.exists ? sessionSnap.data() || {} : {};
    const activeAnonId = String(sessionData.activeAnonId || "").trim();
    const previousAnonId = String(sessionData.previousAnonId || "").trim();

    if (!rotate && activeAnonId) {
      const aliasSnap = await tx.get(db.collection(ANON_MATCH_ALIAS_COLLECTION).doc(activeAnonId));
      const bound = aliasSnap.exists
        ? String((aliasSnap.data() || {}).visitorAuthUid || "").trim()
        : "";
      if (bound === uid) {
        return { anonId: activeAnonId, created: false, rotated: false };
      }
    }

    let newAnonId = mintServerAnonMatchAlias(nowMs);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const aliasRef = db.collection(ANON_MATCH_ALIAS_COLLECTION).doc(newAnonId);
      const aliasSnap = await tx.get(aliasRef);
      if (!aliasSnap.exists) break;
      newAnonId = mintServerAnonMatchAlias(nowMs + attempt + 1);
    }

    if (!isAnonMatchSessionAlias(newAnonId)) {
      throw Object.assign(new Error("alias_generation_failed"), { status: 500 });
    }

    const newAliasRef = db.collection(ANON_MATCH_ALIAS_COLLECTION).doc(newAnonId);
    tx.set(
      newAliasRef,
      {
        visitorAuthUid: uid,
        blockedAnonId: newAnonId,
        source: "anon_match_server",
        status: "active",
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        schemaVersion: 2,
      },
      { merge: true },
    );

    if (activeAnonId && activeAnonId !== newAnonId) {
      tx.set(
        db.collection(ANON_MATCH_ALIAS_COLLECTION).doc(activeAnonId),
        {
          status: "rotated",
          rotatedAtMs: nowMs,
          updatedAtMs: nowMs,
        },
        { merge: true },
      );
    }

    tx.set(
      sessionRef,
      {
        visitorAuthUid: uid,
        activeAnonId: newAnonId,
        previousAnonId: activeAnonId || previousAnonId || "",
        updatedAtMs: nowMs,
        schemaVersion: 1,
      },
      { merge: true },
    );

    return {
      anonId: newAnonId,
      created: !activeAnonId,
      rotated: Boolean(activeAnonId && activeAnonId !== newAnonId),
    };
  });
}
