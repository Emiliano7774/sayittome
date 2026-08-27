/**
 * Admin-SDK abuse writer.
 * Lease is created ONLY via bindVisitorChatLease (atomic chat+lease when chat missing).
 * Never first-claim an existing chat. Legacy unbound → require_new_epoch (no write).
 * Production send path requires trusted direct-GCF IP — never Hosting PENDING fallback.
 * IP hashes never land on readable chat docs.
 */
import {
  ABUSE_ANON_ALIAS_COLLECTION,
  ABUSE_AUDIT_COLLECTION,
  ABUSE_BLOCKS_COLLECTION,
  ABUSE_CHAT_LEASE_COLLECTION,
  ABUSE_IP_INDEX_COLLECTION,
  ABUSE_SEND_PERMIT_COLLECTION,
  ABUSE_SEND_PERMIT_TTL_MS,
  assertProfileOwnerMayBlock,
  computeAbuseBlockExpiry,
  decideVisitorLeaseBind,
  isProfileAnonAbuseBlockActive,
  omitUndefinedFields,
  parseAnonSessionFromChatId,
  readCoveringBlockIdsFromIndex,
  mergeCoveringBlockIds,
  resolveIpIndexSuccessorOnRemove,
  selectPermitsToRevokeOnBlock,
  shouldClearIpIndexOnBlockRemove,
  PROFILE_ANON_ABUSE_BLOCK_MINUTES,
  type AbuseIpCoverage,
  type ProfileAnonAbuseBlockRecord,
} from "@/lib/abuse/profileAnonAbuseBlock";
import {
  abuseAuditEventId,
  profileAnonAbuseBlockDocId,
  profileAnonAbuseIpIndexId,
  profileAnonAbuseMessagePermitId,
} from "@/lib/abuse/profileAnonAbuseBlockIds";
import {
  getTrustedRequestClientIp,
  hashAbuseClientIp,
  newAbuseEpochId,
} from "@/lib/abuse/abuseIpHash";
import type { AbuseAdminTx } from "@/lib/abuse/abuseAdminTypes";

export type AbuseBlockWriteResult =
  | {
      ok: true;
      block: ProfileAnonAbuseBlockRecord;
      replayed: boolean;
      ipCoverage: AbuseIpCoverage;
    }
  | { ok: false; error: string; status: number };

export type AbuseSendPermitResult =
  | {
      ok: true;
      permitId: string;
      expiresAtMs: number;
      blocked: false;
      ipCoverage: AbuseIpCoverage;
    }
  | { ok: false; error: string; status: number; blocked?: boolean };

export type BindVisitorLeaseResult =
  | {
      ok: true;
      chatId: string;
      bound: true;
      created: boolean;
      receptorUid: string;
      username: string;
      ipCoverage?: AbuseIpCoverage;
    }
  | {
      ok: false;
      error: string;
      status: number;
      requireNewEpoch?: boolean;
      reason?: string;
    };

function asMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function readIpHashes(data: Record<string, unknown>): string[] {
  const existing = Array.isArray(data.ipHashes)
    ? data.ipHashes.map((row) => String(row || "").trim()).filter(Boolean)
    : [];
  const single = String(data.ipHash || data.blockedIpHash || "").trim();
  return Array.from(new Set([...existing, ...(single ? [single] : [])])).slice(0, 8);
}

async function getAdminDb() {
  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  return getRepairAdminDb();
}

function mergeLeaseIpHashes(prev: string[], ipHash: string): string[] {
  const hash = String(ipHash || "").trim();
  if (!hash) return prev;
  return Array.from(new Set([...prev, hash])).slice(0, 8);
}

function leaseIpStampFields(ipHash: string, prevHashes: string[] = []) {
  const nextHashes = mergeLeaseIpHashes(prevHashes, ipHash);
  if (!nextHashes.length) return {};
  return { ipHash: nextHashes[0], ipHashes: nextHashes };
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function isEmulatorRuntime() {
  return Boolean(String(process.env.FIRESTORE_EMULATOR_HOST || "").trim());
}

/**
 * Send/bind IP gate — fail-closed. Never issue lease/permit without trusted IP + hash.
 * Production without ABUSE_IP_HASH_SECRET or without direct-GCF path → 503 (config PENDING).
 * Client must use NEXT_PUBLIC_ABUSE_API_BASE (direct Cloud Functions); Hosting alone is not enough.
 */
function requireTrustedSendIp(req: Request):
  | { ok: true; ipHash: string; coverage: "active" }
  | { ok: false; error: string; status: number } {
  const secretConfigured = Boolean(String(process.env.ABUSE_IP_HASH_SECRET || "").trim());
  if (!secretConfigured && isProductionRuntime() && !isEmulatorRuntime()) {
    return { ok: false, error: "abuse_ip_hash_secret_missing", status: 503 };
  }

  const ip = getTrustedRequestClientIp(req);
  if (!ip) {
    return { ok: false, error: "abuse_ip_unavailable", status: 503 };
  }

  try {
    const ipHash = hashAbuseClientIp(ip);
    if (!ipHash) {
      return { ok: false, error: "abuse_ip_unavailable", status: 503 };
    }
    return { ok: true, ipHash, coverage: "active" };
  } catch {
    return { ok: false, error: "abuse_ip_hash_secret_missing", status: 503 };
  }
}

function normalizeUsernameSlug(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 80);
}

/** Server-side profile resolve — doc.id is canonical; detect uid field collision / duplicates. */
async function resolveReceptorFromUsername(input: {
  username: string;
  claimedReceptorUid?: string;
}): Promise<
  | { ok: true; receptorUid: string; username: string }
  | { ok: false; error: string; status: number }
> {
  const slug = normalizeUsernameSlug(input.username);
  if (!slug) return { ok: false, error: "missing_username", status: 400 };
  const db = await getAdminDb();

  const { resolveCanonicalReceptorFromProfileDoc } = await import(
    "@/lib/abuse/profileAnonAbuseBlock"
  );

  async function pickFromQuery(
    field: "usernameLower" | "username",
    value: string,
  ): Promise<
    | { ok: true; receptorUid: string; username: string }
    | { ok: false; error: string; status: number }
    | null
  > {
    const snap = await db.collection("usuarios").where(field, "==", value).limit(2).get();
    if (snap.empty) return null;
    if (snap.size > 1) {
      return { ok: false, error: "profile_username_collision", status: 409 };
    }
    const doc = snap.docs[0];
    const data = (doc.data() || {}) as Record<string, unknown>;
    const canonical = resolveCanonicalReceptorFromProfileDoc({
      docId: doc.id,
      data,
    });
    if (!canonical.ok) {
      return { ok: false, error: canonical.error, status: 409 };
    }
    const usernameResolved = String(data.username || data.usernameLower || slug).trim();
    return { ok: true, receptorUid: canonical.receptorUid, username: usernameResolved };
  }

  const byLower = await pickFromQuery("usernameLower", slug);
  if (byLower && !byLower.ok) return byLower;
  const byExact =
    byLower?.ok ? byLower : await pickFromQuery("username", String(input.username || "").trim());
  if (!byExact) return { ok: false, error: "profile_not_found", status: 404 };
  if (!byExact.ok) return byExact;

  const claimed = String(input.claimedReceptorUid || "").trim();
  if (claimed && claimed !== byExact.receptorUid) {
    return { ok: false, error: "receptor_mismatch", status: 409 };
  }
  return byExact;
}

/** Soft IP hash for check probes only — never used to authorize send in production. */
function softHashRequestIp(req: Request): { ipHash: string } {
  const ip = getTrustedRequestClientIp(req);
  if (!ip) return { ipHash: "" };
  try {
    return { ipHash: hashAbuseClientIp(ip) || "" };
  } catch {
    return { ipHash: "" };
  }
}

export async function findActiveProfileAnonAbuseForRequest(input: {
  receptorUid: string;
  chatId?: string;
  req: Request;
  nowMs?: number;
}): Promise<{ blocked: boolean; reason: string }> {
  const nowMs = Number(input.nowMs || Date.now());
  const receptorUid = String(input.receptorUid || "").trim();
  if (!receptorUid) return { blocked: false, reason: "" };

  const db = await getAdminDb();
  const { ipHash } = softHashRequestIp(input.req);

  if (ipHash) {
    const ipDoc = await db
      .collection(ABUSE_IP_INDEX_COLLECTION)
      .doc(profileAnonAbuseIpIndexId(receptorUid, ipHash))
      .get();
    if (ipDoc.exists) {
      const data = ipDoc.data() || {};
      if (
        isProfileAnonAbuseBlockActive(
          { expiresAtMs: asMs(data.expiresAtMs), status: String(data.status || "active") },
          nowMs,
        )
      ) {
        return { blocked: true, reason: "ip_block" };
      }
    }
  }

  const chatId = String(input.chatId || "").trim();
  if (!chatId) return { blocked: false, reason: "" };

  const blockId = profileAnonAbuseBlockDocId(receptorUid, chatId);
  const blockSnap = await db.collection(ABUSE_BLOCKS_COLLECTION).doc(blockId).get();
  if (blockSnap.exists) {
    const data = blockSnap.data() || {};
    if (
      isProfileAnonAbuseBlockActive(
        { expiresAtMs: asMs(data.expiresAtMs), status: String(data.status || "active") },
        nowMs,
      )
    ) {
      return { blocked: true, reason: "chat_block" };
    }
  }

  const anonId = parseAnonSessionFromChatId(chatId);
  if (anonId) {
    const byAnon = await db
      .collection(ABUSE_BLOCKS_COLLECTION)
      .where("receptorUid", "==", receptorUid)
      .where("blockedAnonId", "==", anonId)
      .limit(5)
      .get();
    for (const doc of byAnon.docs) {
      const data = doc.data() || {};
      if (
        isProfileAnonAbuseBlockActive(
          { expiresAtMs: asMs(data.expiresAtMs), status: String(data.status || "active") },
          nowMs,
        )
      ) {
        return { blocked: true, reason: "anon_block" };
      }
    }
  }

  return { blocked: false, reason: "" };
}

/**
 * Server-issued session binding BEFORE client may create/send.
 * Creates chat+lease atomically only when chat is missing.
 * Existing chat without lease → require_new_epoch, write nothing.
 * Resolves receptor from username server-side; requires trusted IP.
 */
export async function bindVisitorChatLease(input: {
  visitorAuthUid: string;
  chatId: string;
  receptorUid?: string;
  username: string;
  req: Request;
  nowMs?: number;
}): Promise<BindVisitorLeaseResult> {
  const visitorAuthUid = String(input.visitorAuthUid || "").trim();
  const chatId = String(input.chatId || "").trim();
  const nowMs = Number(input.nowMs || Date.now());

  if (!visitorAuthUid) return { ok: false, error: "unauthenticated", status: 401 };
  if (!chatId) return { ok: false, error: "missing_fields", status: 400 };

  const blockedAnonId = parseAnonSessionFromChatId(chatId);
  if (!blockedAnonId) return { ok: false, error: "invalid_chat", status: 400 };

  const profile = await resolveReceptorFromUsername({
    username: String(input.username || ""),
    claimedReceptorUid: input.receptorUid,
  });
  if (!profile.ok) {
    return { ok: false, error: profile.error, status: profile.status };
  }
  const { receptorUid, username } = profile;
  if (visitorAuthUid === receptorUid) {
    return { ok: false, error: "owner_cannot_bind_visitor_lease", status: 403 };
  }

  // chatId target slug must match resolved profile username slug
  const chatTarget = String(chatId.split("__anon_to__")[1] || "");
  if (normalizeUsernameSlug(chatTarget) !== normalizeUsernameSlug(username)) {
    return { ok: false, error: "chat_username_mismatch", status: 409 };
  }

  const ipReq = requireTrustedSendIp(input.req);
  if (!ipReq.ok) {
    return { ok: false, error: ipReq.error, status: ipReq.status };
  }
  const { ipHash, coverage: bindIpCoverage } = ipReq;

  try {
    const db = await getAdminDb();
    const chatRef = db.collection("chats").doc(chatId);
    const leaseRef = db.collection(ABUSE_CHAT_LEASE_COLLECTION).doc(chatId);
    const aliasRef = db.collection(ABUSE_ANON_ALIAS_COLLECTION).doc(blockedAnonId);

    const outcome = await db.runTransaction(async (tx: AbuseAdminTx) => {
      const [chatSnap, leaseSnap, aliasSnap] = await Promise.all([
        tx.get(chatRef),
        tx.get(leaseRef),
        tx.get(aliasRef),
      ]);
      const leaseData = (leaseSnap.exists ? leaseSnap.data() : null) as Record<
        string,
        unknown
      > | null;
      const decision = decideVisitorLeaseBind({
        visitorAuthUid,
        chatExists: chatSnap.exists,
        leaseVisitorAuthUid: leaseData
          ? String(leaseData.visitorAuthUid || "").trim()
          : null,
      });

      if (decision.action === "deny") {
        throw Object.assign(new Error(decision.reason), { status: 403 });
      }
      if (decision.action === "require_new_epoch") {
        throw Object.assign(new Error(decision.reason), {
          status: 409,
          requireNewEpoch: true,
        });
      }

      if (aliasSnap.exists) {
        const aliasUid = String((aliasSnap.data() || {}).visitorAuthUid || "").trim();
        if (aliasUid && aliasUid !== visitorAuthUid) {
          throw Object.assign(new Error("foreign_anon_alias"), {
            status: 403,
            requireNewEpoch: true,
          });
        }
      }

      if (decision.action === "refresh") {
        const prevHashes = readIpHashes(leaseData || {});
        tx.set(
          leaseRef,
          omitUndefinedFields({
            visitorAuthUid,
            ...leaseIpStampFields(ipHash, prevHashes),
            updatedAtMs: nowMs,
          }),
          { merge: true },
        );
        tx.set(
          aliasRef,
          {
            visitorAuthUid,
            blockedAnonId,
            updatedAtMs: nowMs,
            schemaVersion: 1,
          },
          { merge: true },
        );
        return { created: false as const };
      }

      const epochId = newAbuseEpochId();
      tx.create(chatRef, {
        id: chatId,
        canonicalChatId: chatId,
        receptorUid,
        targetUid: receptorUid,
        anonOwnerUid: receptorUid,
        anonSessionId: blockedAnonId,
        participantes: [blockedAnonId, receptorUid, visitorAuthUid],
        anon: true,
        senderIsAnonymous: true,
        schemaVersion: 2,
        targetUsername: username,
        receptorUsername: username,
        visitorLeaseBoundAtMs: nowMs,
        visitorLeaseEpochId: epochId,
        createdAtMs: nowMs,
      });
      tx.create(
        leaseRef,
        omitUndefinedFields({
          chatId,
          receptorUid,
          blockedAnonId,
          visitorAuthUid,
          epochId,
          ...leaseIpStampFields(ipHash),
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
          schemaVersion: 1,
        }),
      );
      tx.set(
        aliasRef,
        {
          visitorAuthUid,
          blockedAnonId,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
          schemaVersion: 1,
        },
        { merge: true },
      );
      return { created: true as const };
    });

    return {
      ok: true,
      chatId,
      bound: true,
      created: outcome.created,
      receptorUid,
      username,
      ipCoverage: bindIpCoverage,
    };
  } catch (error) {
    const requireNewEpoch = Boolean((error as { requireNewEpoch?: boolean })?.requireNewEpoch);
    const status = Number((error as { status?: number })?.status || 500);
    const message = String((error as Error)?.message || "bind_failed");
    if (requireNewEpoch) {
      return {
        ok: false,
        error: message,
        status: 409,
        requireNewEpoch: true,
        reason: message,
      };
    }
    if (/ALREADY_EXISTS|already exists/i.test(message)) {
      return {
        ok: false,
        error: "legacy_unbound",
        status: 409,
        requireNewEpoch: true,
        reason: "legacy_unbound",
      };
    }
    return { ok: false, error: message, status: status >= 400 && status < 600 ? status : 500 };
  }
}

/**
 * Issues a short-lived one-shot permit bound to messageId.
 * Requires an existing matching lease — never creates lease.
 */
export async function issueAbuseSendPermit(input: {
  visitorAuthUid: string;
  chatId: string;
  receptorUid: string;
  messageId: string;
  req: Request;
  nowMs?: number;
}): Promise<AbuseSendPermitResult> {
  const visitorAuthUid = String(input.visitorAuthUid || "").trim();
  const chatId = String(input.chatId || "").trim();
  const receptorUid = String(input.receptorUid || "").trim();
  const messageId = String(input.messageId || "").trim();
  const nowMs = Number(input.nowMs || Date.now());

  if (!visitorAuthUid) return { ok: false, error: "unauthenticated", status: 401 };
  if (!chatId || !receptorUid || !messageId) {
    return { ok: false, error: "missing_fields", status: 400 };
  }
  if (visitorAuthUid === receptorUid) {
    return { ok: false, error: "owner_cannot_issue_visitor_permit", status: 403 };
  }

  const blockedAnonId = parseAnonSessionFromChatId(chatId);
  if (!blockedAnonId) return { ok: false, error: "invalid_chat", status: 400 };

  try {
    const db = await getAdminDb();
    const chatSnap = await db.collection("chats").doc(chatId).get();
    if (!chatSnap.exists) return { ok: false, error: "chat_not_found", status: 404 };
    const chat = (chatSnap.data() || {}) as Record<string, unknown>;
    const chatReceptor = String(
      chat.receptorUid || chat.targetUid || chat.anonOwnerUid || "",
    ).trim();
    if (!chatReceptor || chatReceptor !== receptorUid) {
      return { ok: false, error: "receptor_mismatch", status: 409 };
    }

    const leaseSnap = await db.collection(ABUSE_CHAT_LEASE_COLLECTION).doc(chatId).get();
    if (!leaseSnap.exists) {
      return { ok: false, error: "legacy_unbound", status: 409 };
    }
    const lease = (leaseSnap.data() || {}) as Record<string, unknown>;
    const boundUid = String(lease.visitorAuthUid || "").trim();
    if (!boundUid || boundUid !== visitorAuthUid) {
      return { ok: false, error: "foreign_chat_lease", status: 403 };
    }

    const hit = await findActiveProfileAnonAbuseForRequest({
      receptorUid,
      chatId,
      req: input.req,
      nowMs,
    });
    if (hit.blocked) {
      return { ok: false, error: "blocked", status: 403, blocked: true };
    }

    const ipReq = requireTrustedSendIp(input.req);
    if (!ipReq.ok) {
      return { ok: false, error: ipReq.error, status: ipReq.status };
    }
    const { ipHash, coverage } = ipReq;

    // Deterministic permit id → messageId is one-shot (create fails on reuse).
    const permitId = profileAnonAbuseMessagePermitId(chatId, messageId);
    const expiresAtMs = nowMs + ABUSE_SEND_PERMIT_TTL_MS;

    await db.runTransaction(async (tx: AbuseAdminTx) => {
      const freshLease = await tx.get(db.collection(ABUSE_CHAT_LEASE_COLLECTION).doc(chatId));
      if (!freshLease.exists) {
        throw Object.assign(new Error("legacy_unbound"), { status: 409 });
      }
      const fresh = (freshLease.data() || {}) as Record<string, unknown>;
      if (String(fresh.visitorAuthUid || "").trim() !== visitorAuthUid) {
        throw Object.assign(new Error("foreign_chat_lease"), { status: 403 });
      }

      const permitRef = db.collection(ABUSE_SEND_PERMIT_COLLECTION).doc(permitId);
      const existingPermit = await tx.get(permitRef);
      if (existingPermit.exists) {
        throw Object.assign(new Error("message_id_permit_reuse"), { status: 409 });
      }

      const prevHashes = readIpHashes(fresh);
      tx.set(
        db.collection(ABUSE_CHAT_LEASE_COLLECTION).doc(chatId),
        omitUndefinedFields({
          ...leaseIpStampFields(ipHash, prevHashes),
          updatedAtMs: nowMs,
        }),
        { merge: true },
      );

      tx.create(
        permitRef,
        omitUndefinedFields({
          permitId,
          chatId,
          receptorUid,
          visitorAuthUid,
          blockedAnonId,
          messageId,
          ipHash,
          expiresAtMs,
          createdAtMs: nowMs,
          schemaVersion: 2,
        }),
      );
    });

    return { ok: true, permitId, expiresAtMs, blocked: false, ipCoverage: coverage };
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 500);
    const message = String((error as Error)?.message || "permit_failed");
    if (/ALREADY_EXISTS|already exists|message_id_permit_reuse/i.test(message)) {
      return { ok: false, error: "message_id_permit_reuse", status: 409 };
    }
    return { ok: false, error: message, status: status >= 400 && status < 600 ? status : 500 };
  }
}

export async function applyProfileAnonAbuseBlock(input: {
  authUid: string;
  chatId: string;
  motivo?: string;
  nowMs?: number;
}): Promise<AbuseBlockWriteResult> {
  const chatId = String(input.chatId || "").trim();
  const authUid = String(input.authUid || "").trim();
  const nowMs = Number(input.nowMs || Date.now());
  if (!chatId || !authUid) {
    return { ok: false, error: "missing_fields", status: 400 };
  }

  try {
    const db = await getAdminDb();
    const chatRef = db.collection("chats").doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) return { ok: false, error: "chat_not_found", status: 404 };
    const chat = (chatSnap.data() || {}) as Record<string, unknown>;

    const { receptorUid, blockedAnonId } = assertProfileOwnerMayBlock({
      authUid,
      chat,
      chatId,
    });

    const leaseSnap = await db.collection(ABUSE_CHAT_LEASE_COLLECTION).doc(chatId).get();
    const lease = (leaseSnap.exists ? leaseSnap.data() : {}) as Record<string, unknown>;
    const verifiedVisitorAuthUid = String(lease.visitorAuthUid || "").trim();
    const ipHashes = readIpHashes(lease);
    const ipCoverage: AbuseIpCoverage =
      verifiedVisitorAuthUid && ipHashes.length > 0 ? "active" : "pending";
    const primaryHash = ipCoverage === "active" ? ipHashes[0] || "" : "";

    const blockId = profileAnonAbuseBlockDocId(receptorUid, chatId);
    const blockRef = db.collection(ABUSE_BLOCKS_COLLECTION).doc(blockId);
    const motivo = String(input.motivo || "bloqueo_30m").trim().slice(0, 80) || "bloqueo_30m";
    const expiresAtMs = computeAbuseBlockExpiry(nowMs, PROFILE_ANON_ABUSE_BLOCK_MINUTES);

    // Revoke permits for blocked chat OR same verified IP — never all receptor permits.
    const receptorPermitsSnap = await db
      .collection(ABUSE_SEND_PERMIT_COLLECTION)
      .where("receptorUid", "==", receptorUid)
      .limit(80)
      .get();
    const revokeIds = new Set(
      selectPermitsToRevokeOnBlock({
        blockedChatId: chatId,
        receptorUid,
        blockedIpHashes: ipCoverage === "active" ? ipHashes : [],
        permits: receptorPermitsSnap.docs.map((doc: { id: string; data: () => Record<string, unknown> }) => {
          const data = doc.data() || {};
          return {
            id: doc.id,
            chatId: String(data.chatId || ""),
            receptorUid: String(data.receptorUid || ""),
            ipHash: String(data.ipHash || ""),
          };
        }),
      }),
    );

    const result = await db.runTransaction(async (tx: AbuseAdminTx) => {
      const existing = await tx.get(blockRef);
      if (existing.exists) {
        const prev = existing.data() || {};
        const prevVerified = String(prev.verifiedVisitorAuthUid || "").trim();
        const prevRecord: ProfileAnonAbuseBlockRecord = {
          id: blockId,
          direction: "profile_to_anon",
          receptorUid,
          chatId,
          blockedAnonId: String(prev.blockedAnonId || blockedAnonId),
          blockedIpHash: String(prev.blockedIpHash || ""),
          blockedByUid: String(prev.blockedByUid || authUid),
          motivo: String(prev.motivo || motivo),
          createdAtMs: asMs(prev.createdAtMs) || nowMs,
          expiresAtMs: asMs(prev.expiresAtMs),
          status: (String(prev.status || "active") as "active" | "expired" | "removed") || "active",
          ...(prevVerified ? { verifiedVisitorAuthUid: prevVerified } : {}),
          ipCoverage: (String(prev.ipCoverage || "pending") as AbuseIpCoverage) || "pending",
          schemaVersion: 2,
        };
        if (isProfileAnonAbuseBlockActive(prevRecord, nowMs)) {
          return {
            ok: true as const,
            block: prevRecord,
            replayed: true,
            ipCoverage: prevRecord.ipCoverage,
          };
        }
      }

      const record: ProfileAnonAbuseBlockRecord = {
        id: blockId,
        direction: "profile_to_anon",
        receptorUid,
        chatId,
        blockedAnonId,
        blockedIpHash: primaryHash,
        blockedByUid: authUid,
        motivo,
        createdAtMs: nowMs,
        expiresAtMs,
        status: "active",
        ...(verifiedVisitorAuthUid ? { verifiedVisitorAuthUid } : {}),
        ipCoverage,
        schemaVersion: 2,
      };

      const indexReadsForApply: Array<{
        hash: string;
        snap: { exists: boolean; data: () => Record<string, unknown> | undefined };
      }> = [];
      if (ipCoverage === "active") {
        for (const hash of ipHashes) {
          const indexRef = db
            .collection(ABUSE_IP_INDEX_COLLECTION)
            .doc(profileAnonAbuseIpIndexId(receptorUid, hash));
          indexReadsForApply.push({ hash, snap: await tx.get(indexRef) });
        }
      }

      tx.set(
        blockRef,
        omitUndefinedFields({
          ...record,
          ipHashes: ipCoverage === "active" ? ipHashes : [],
          blockedFingerprint: primaryHash
            ? `iphash::${primaryHash.slice(0, 16)}`
            : `anon::${blockedAnonId}`,
          blockedVisitorId: "",
          blockedClientIp: null,
          verifiedAuthLink: verifiedVisitorAuthUid ? "verified" : "unknown",
          createdAt: new Date(nowMs).toISOString(),
          expiresAt: new Date(expiresAtMs).toISOString(),
          blockedBy: authUid,
        }),
        { merge: true },
      );

      const auditRef = db
        .collection(ABUSE_AUDIT_COLLECTION)
        .doc(abuseAuditEventId(blockId, nowMs, existing.exists ? "reblock" : "create"));
      tx.create(auditRef, {
        blockId,
        event: existing.exists ? "reblock_after_expiry" : "create",
        receptorUid,
        chatId,
        blockedAnonId,
        blockedByUid: authUid,
        ipCoverage,
        hasIpHash: Boolean(primaryHash),
        hasVerifiedVisitorAuthUid: Boolean(verifiedVisitorAuthUid),
        expiresAtMs,
        createdAtMs: nowMs,
        schemaVersion: 1,
      });

      if (ipCoverage === "active") {
        for (const row of indexReadsForApply) {
          const hash = row.hash;
          const prevData = row.snap.exists ? (row.snap.data() || {}) : {};
          const coveringBlockIds = mergeCoveringBlockIds(
            readCoveringBlockIdsFromIndex(prevData),
            blockId,
          );
          const prevExpires = asMs(prevData.expiresAtMs) || 0;
          tx.set(
            db
              .collection(ABUSE_IP_INDEX_COLLECTION)
              .doc(profileAnonAbuseIpIndexId(receptorUid, hash)),
            {
              receptorUid,
              blockedIpHash: hash,
              chatId,
              blockId,
              coveringBlockIds,
              expiresAtMs: Math.max(prevExpires, expiresAtMs),
              status: "active",
              createdAtMs: asMs(prevData.createdAtMs) || nowMs,
              schemaVersion: 1,
            },
            { merge: true },
          );
        }
      }

      tx.set(
        chatRef,
        {
          profileBlocksVisitor: true,
          profileBlocksVisitorUntilMs: expiresAtMs,
          profileBlocksVisitorBlockId: blockId,
          profileBlocksVisitorAtMs: nowMs,
        },
        { merge: true },
      );

      for (const permitDoc of receptorPermitsSnap.docs) {
        if (!revokeIds.has(permitDoc.id)) continue;
        tx.set(
          permitDoc.ref,
          { revokedAtMs: nowMs, status: "revoked" },
          { merge: true },
        );
      }

      return { ok: true as const, block: record, replayed: false, ipCoverage };
    });

    return result;
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 500);
    const message = String((error as Error)?.message || "block_failed");
    if (/ALREADY_EXISTS|already exists/i.test(message)) {
      return { ok: false, error: "concurrent_block", status: 409 };
    }
    return { ok: false, error: message, status: status >= 400 && status < 600 ? status : 500 };
  }
}

/**
 * Transactional remove: clear block + owned IP indexes only (foreign index.blockId preserved).
 * All tx reads complete before any write. Owner resolved via index.blockId doc, not limit-N query.
 */
export async function removeProfileAnonAbuseBlock(input: {
  blockId: string;
  adminUid: string;
  adminEmail: string;
  nowMs?: number;
}): Promise<{ ok: true; replayed?: boolean } | { ok: false; error: string; status: number }> {
  const blockId = String(input.blockId || "").trim();
  const adminUid = String(input.adminUid || "").trim();
  const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
  const nowMs = Number(input.nowMs || Date.now());
  if (!blockId || !adminUid) return { ok: false, error: "missing_fields", status: 400 };

  try {
    const db = await getAdminDb();
    const blockRef = db.collection(ABUSE_BLOCKS_COLLECTION).doc(blockId);

    await db.runTransaction(async (tx: AbuseAdminTx) => {
      const fresh = await tx.get(blockRef);
      if (!fresh.exists) return;
      const freshData = (fresh.data() || {}) as Record<string, unknown>;
      if (String(freshData.status || "") === "removed") return;

      const receptorUid = String(freshData.receptorUid || "").trim();
      const chatId = String(freshData.chatId || "").trim();
      const removingHashes = readIpHashes(freshData);

      if (!receptorUid) {
        throw Object.assign(new Error("block_missing_receptor"), { status: 409 });
      }

      type IndexRead = {
        hash: string;
        snap: { exists: boolean; data: () => Record<string, unknown> | undefined };
      };
      const indexReads: IndexRead[] = [];
      for (const hash of removingHashes) {
        const indexRef = db
          .collection(ABUSE_IP_INDEX_COLLECTION)
          .doc(profileAnonAbuseIpIndexId(receptorUid, hash));
        indexReads.push({ hash, snap: await tx.get(indexRef) });
      }

      const foreignBlockIds = new Set<string>();
      const coveringIdsFromOwnedIndexes = new Set<string>();
      for (const row of indexReads) {
        if (!row.snap.exists) continue;
        const indexData = (row.snap.data() || {}) as Record<string, unknown>;
        const indexBlockId = String(indexData.blockId || "").trim();
        const covering = readCoveringBlockIdsFromIndex(indexData);
        for (const id of covering) {
          if (id && id !== blockId) foreignBlockIds.add(id);
        }
        if (
          shouldClearIpIndexOnBlockRemove({
            removingBlockId: blockId,
            indexBlockId,
            indexStatus: String(indexData.status || "active"),
          })
        ) {
          for (const id of covering) {
            if (id && id !== blockId) coveringIdsFromOwnedIndexes.add(id);
          }
        } else if (indexBlockId && indexBlockId !== blockId) {
          foreignBlockIds.add(indexBlockId);
        }
      }

      const blockIdsToRead = new Set<string>([...foreignBlockIds, ...coveringIdsFromOwnedIndexes]);
      const blockSnaps = new Map<
        string,
        { exists: boolean; data: () => Record<string, unknown> | undefined }
      >();
      for (const blockDocId of blockIdsToRead) {
        blockSnaps.set(
          blockDocId,
          await tx.get(db.collection(ABUSE_BLOCKS_COLLECTION).doc(blockDocId)),
        );
      }

      const blocksById = new Map<
        string,
        {
          id: string;
          chatId?: string;
          status?: string;
          expiresAtMs?: number;
          blockedIpHash?: string;
          ipHashes?: string[];
        }
      >();
      for (const [id, snap] of blockSnaps) {
        if (!snap.exists) continue;
        const data = (snap.data() || {}) as Record<string, unknown>;
        blocksById.set(id, {
          id,
          chatId: String(data.chatId || ""),
          status: String(data.status || "active"),
          expiresAtMs: asMs(data.expiresAtMs),
          blockedIpHash: String(data.blockedIpHash || ""),
          ipHashes: Array.isArray(data.ipHashes)
            ? data.ipHashes.map((h) => String(h || "").trim()).filter(Boolean)
            : [],
        });
      }

      const chatRef = chatId ? db.collection("chats").doc(chatId) : null;
      const chatSnap = chatRef ? await tx.get(chatRef) : null;

      const hashesToClear: string[] = [];
      const hashesToReassign: Array<{
        hash: string;
        successor: NonNullable<ReturnType<typeof resolveIpIndexSuccessorOnRemove>>;
      }> = [];
      for (const row of indexReads) {
        if (!row.snap.exists) continue;
        const indexData = (row.snap.data() || {}) as Record<string, unknown>;
        const indexBlockId = String(indexData.blockId || "").trim();
        if (
          indexBlockId &&
          indexBlockId !== blockId &&
          blockSnaps.has(indexBlockId)
        ) {
          const foreign = blockSnaps.get(indexBlockId);
          if (
            foreign?.exists &&
            isProfileAnonAbuseBlockActive(
              {
                expiresAtMs: asMs((foreign.data() || {}).expiresAtMs),
                status: String((foreign.data() || {}).status || "active"),
              },
              nowMs,
            )
          ) {
            continue;
          }
        }
        if (
          !shouldClearIpIndexOnBlockRemove({
            removingBlockId: blockId,
            indexBlockId,
            indexStatus: String(indexData.status || "active"),
          })
        ) {
          continue;
        }
        const coveringBlockIds = readCoveringBlockIdsFromIndex(indexData);
        const successor = resolveIpIndexSuccessorOnRemove({
          removingBlockId: blockId,
          hash: row.hash,
          coveringBlockIds,
          blocksById,
          nowMs,
        });
        if (successor) {
          hashesToReassign.push({ hash: row.hash, successor });
        } else {
          hashesToClear.push(row.hash);
        }
      }

      tx.set(
        blockRef,
        {
          status: "removed",
          removedAtMs: nowMs,
          removedByUid: adminUid,
          removedByEmail: adminEmail,
        },
        { merge: true },
      );

      for (const row of hashesToReassign) {
        const indexRef = db
          .collection(ABUSE_IP_INDEX_COLLECTION)
          .doc(profileAnonAbuseIpIndexId(receptorUid, row.hash));
        tx.set(
          indexRef,
          {
            receptorUid,
            blockedIpHash: row.hash,
            chatId: row.successor.chatId,
            blockId: row.successor.blockId,
            coveringBlockIds: row.successor.coveringBlockIds,
            expiresAtMs: row.successor.expiresAtMs,
            status: "active",
            reassignedAtMs: nowMs,
            reassignedFromBlockId: blockId,
          },
          { merge: true },
        );
      }

      for (const hash of hashesToClear) {
        const indexRef = db
          .collection(ABUSE_IP_INDEX_COLLECTION)
          .doc(profileAnonAbuseIpIndexId(receptorUid, hash));
        tx.set(
          indexRef,
          { status: "removed", removedAtMs: nowMs, removedByBlockId: blockId },
          { merge: true },
        );
      }

      if (chatRef && chatSnap?.exists) {
        const chatData = (chatSnap.data() || {}) as Record<string, unknown>;
        const flagBlockId = String(chatData.profileBlocksVisitorBlockId || "").trim();
        if (!flagBlockId || flagBlockId === blockId) {
          tx.set(
            chatRef,
            {
              profileBlocksVisitor: false,
              profileBlocksVisitorUntilMs: 0,
              profileBlocksVisitorBlockId: "",
              profileBlocksVisitorClearedAtMs: nowMs,
            },
            { merge: true },
          );
        }
      }

      tx.create(
        db.collection(ABUSE_AUDIT_COLLECTION).doc(abuseAuditEventId(blockId, nowMs, "remove")),
        {
          blockId,
          event: "remove",
          receptorUid,
          chatId,
          adminUid,
          adminEmail,
          clearedIpHashes: hashesToClear.length,
          reassignedIpHashes: hashesToReassign.length,
          createdAtMs: nowMs,
          schemaVersion: 1,
        },
      );
    });

    const after = await blockRef.get();
    if (!after.exists) return { ok: true, replayed: true };
    if (String((after.data() || {}).status || "") === "removed") {
      return { ok: true };
    }
    return { ok: false, error: "remove_not_applied", status: 500 };
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 500);
    const message = String((error as Error)?.message || "remove_failed");
    if (/FAILED_PRECONDITION|requires an index/i.test(message)) {
      return { ok: false, error: "remove_sibling_query_failed", status: 503 };
    }
    if (/transactions require all reads to be executed before all writes/i.test(message)) {
      return { ok: false, error: "remove_tx_read_order", status: 500 };
    }
    if (/ALREADY_EXISTS|already exists/i.test(message)) {
      return { ok: true, replayed: true };
    }
    return { ok: false, error: message, status: status >= 400 && status < 600 ? status : 500 };
  }
}
