/**
 * Browser-safe abuse constants + pure decisions (no Node crypto imports).
 * Client components may import ONLY from this module.
 */

export const PROFILE_ANON_ABUSE_BLOCK_MINUTES = 30;
export const PROFILE_ANON_ABUSE_BLOCK_MS = PROFILE_ANON_ABUSE_BLOCK_MINUTES * 60 * 1000;
export const ABUSE_SEND_PERMIT_TTL_MS = 5 * 60 * 1000;
export const ANON_TO_MARKER = "__anon_to__";

export const ABUSE_VISITOR_CONTEXT_COLLECTION = "anon_abuse_visitor_context";
export const ABUSE_CHAT_LEASE_COLLECTION = "anon_abuse_chat_leases";
export const ABUSE_SEND_PERMIT_COLLECTION = "anon_abuse_send_permits";
export const ABUSE_IP_INDEX_COLLECTION = "anon_abuse_ip_index";
export const ABUSE_BLOCKS_COLLECTION = "anon_abuse_blocks";
export const ABUSE_AUDIT_COLLECTION = "anon_abuse_block_audit";
export const ABUSE_ANON_ALIAS_COLLECTION = "anon_abuse_anon_aliases";

export type AbuseIpCoverage = "active" | "pending";

export type ProfileAnonAbuseBlockRecord = {
  id: string;
  direction: "profile_to_anon";
  receptorUid: string;
  chatId: string;
  blockedAnonId: string;
  blockedIpHash: string;
  blockedByUid: string;
  motivo: string;
  createdAtMs: number;
  expiresAtMs: number;
  status: "active" | "expired" | "removed";
  /** Only from server lease (verified token at bind / first legitimate send). */
  verifiedVisitorAuthUid?: string;
  ipCoverage: AbuseIpCoverage;
  schemaVersion: 2;
};

export type VisitorLeaseBindDecision =
  | { action: "refresh"; visitorAuthUid: string }
  | { action: "create_atomic"; reason: "chat_missing" }
  | {
      action: "require_new_epoch";
      reason: "legacy_unbound" | "foreign_lease";
      writeLease: false;
    }
  | { action: "deny"; reason: string; writeLease: false };

/**
 * Pure bind decision — third party cannot claim first lease on an existing chat.
 * Legacy without lease → require_new_epoch (no write). Missing chat → create_atomic.
 */
export function decideVisitorLeaseBind(input: {
  visitorAuthUid: string;
  chatExists: boolean;
  leaseVisitorAuthUid: string | null | undefined;
}): VisitorLeaseBindDecision {
  const visitorAuthUid = String(input.visitorAuthUid || "").trim();
  if (!visitorAuthUid) {
    return { action: "deny", reason: "unauthenticated", writeLease: false };
  }

  const bound = String(input.leaseVisitorAuthUid || "").trim();
  if (bound) {
    if (bound !== visitorAuthUid) {
      return { action: "require_new_epoch", reason: "foreign_lease", writeLease: false };
    }
    return { action: "refresh", visitorAuthUid: bound };
  }

  if (input.chatExists) {
    return { action: "require_new_epoch", reason: "legacy_unbound", writeLease: false };
  }

  return { action: "create_atomic", reason: "chat_missing" };
}

export function parseAnonSessionFromChatId(chatId: string): string {
  const id = String(chatId || "").trim();
  if (!id.includes(ANON_TO_MARKER)) return "";
  const senderId = id.split(ANON_TO_MARKER)[0] || "";
  return senderId.startsWith("anon_") ? senderId : "";
}

export function isProfileAnonChatId(chatId: string): boolean {
  return String(chatId || "").includes(ANON_TO_MARKER);
}

export function computeAbuseBlockExpiry(nowMs: number, minutes = PROFILE_ANON_ABUSE_BLOCK_MINUTES) {
  const start = Number(nowMs);
  if (!Number.isFinite(start)) throw new Error("invalid_now");
  if (Number(minutes) !== PROFILE_ANON_ABUSE_BLOCK_MINUTES) {
    throw new Error("duration_not_allowed");
  }
  return start + PROFILE_ANON_ABUSE_BLOCK_MS;
}

export function isProfileAnonAbuseBlockActive(
  block: { expiresAtMs?: number; status?: string } | null | undefined,
  nowMs = Date.now(),
) {
  if (!block) return false;
  if (String(block.status || "") === "removed") return false;
  const expires = Number(block.expiresAtMs || 0);
  if (!Number.isFinite(expires) || expires <= 0) return false;
  return expires > nowMs;
}

export function assertProfileOwnerMayBlock(input: {
  authUid: string;
  chat: Record<string, unknown>;
  chatId: string;
}): { receptorUid: string; blockedAnonId: string } {
  const authUid = String(input.authUid || "").trim();
  if (!authUid) throw Object.assign(new Error("unauthenticated"), { status: 401 });

  const chatId = String(input.chatId || "").trim();
  const blockedAnonId = parseAnonSessionFromChatId(chatId);
  if (!chatId || !blockedAnonId) {
    throw Object.assign(new Error("invalid_chat"), { status: 400 });
  }

  const receptorUid = String(
    input.chat.receptorUid || input.chat.targetUid || input.chat.anonOwnerUid || "",
  ).trim();
  if (!receptorUid) {
    throw Object.assign(new Error("chat_missing_receptor"), { status: 409 });
  }
  if (authUid !== receptorUid) {
    throw Object.assign(new Error("not_chat_owner"), { status: 403 });
  }

  return { receptorUid, blockedAnonId };
}

export function redactAbuseBlockForClient(block: ProfileAnonAbuseBlockRecord | null) {
  if (!block) return null;
  return {
    id: block.id,
    direction: block.direction,
    chatId: block.chatId,
    blockedAnonId: block.blockedAnonId,
    expiresAtMs: block.expiresAtMs,
    createdAtMs: block.createdAtMs,
    status: block.status,
    ipCoverage: block.ipCoverage,
  };
}

/** Omit undefined so Firestore transactions never write undefined fields. */
export function omitUndefinedFields<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * Pure IP-scope block check for tests / decision helpers.
 * A blocked by (receptor, ipHash) → B same IP blocked; C other IP ok; other receptor ok.
 */
export function isVisitorIpBlockedForReceptor(input: {
  receptorUid: string;
  requestIpHash: string;
  activeIpIndex: Array<{ receptorUid: string; blockedIpHash: string; status?: string; expiresAtMs?: number }>;
  nowMs?: number;
}): boolean {
  const receptorUid = String(input.receptorUid || "").trim();
  const requestIpHash = String(input.requestIpHash || "").trim();
  if (!receptorUid || !requestIpHash) return false;
  const nowMs = Number(input.nowMs || Date.now());
  return input.activeIpIndex.some((row) => {
    if (String(row.receptorUid || "") !== receptorUid) return false;
    if (String(row.blockedIpHash || "") !== requestIpHash) return false;
    return isProfileAnonAbuseBlockActive(
      { expiresAtMs: row.expiresAtMs, status: row.status || "active" },
      nowMs,
    );
  });
}

/**
 * Which outstanding permits must be revoked when A is blocked.
 * Revoke permits for the blocked chat AND permits whose ipHash matches the
 * verified blocked IP for this receptor — never all permits for the receptor,
 * and never C's different-IP permits.
 */
export function selectPermitsToRevokeOnBlock(input: {
  blockedChatId: string;
  receptorUid: string;
  blockedIpHashes: string[];
  permits: Array<{ id: string; chatId: string; receptorUid: string; ipHash?: string }>;
}): string[] {
  const chatId = String(input.blockedChatId || "").trim();
  const receptorUid = String(input.receptorUid || "").trim();
  const hashes = new Set(input.blockedIpHashes.map((h) => String(h || "").trim()).filter(Boolean));
  const out: string[] = [];
  for (const permit of input.permits) {
    if (String(permit.receptorUid || "") !== receptorUid) continue;
    const sameChat = String(permit.chatId || "") === chatId;
    const sameIp = Boolean(permit.ipHash && hashes.has(String(permit.ipHash)));
    if (sameChat || sameIp) out.push(permit.id);
  }
  return out;
}

/**
 * Visitor send path: live browser anon must match chatId epoch.
 * Mismatch (e.g. logout rotated anon but URL still old) → require_new_epoch.
 */
export function decideLiveAnonEpoch(input: {
  chatId: string;
  liveAnonId: string;
  isOwnerReply: boolean;
}): { action: "ok" } | { action: "require_new_epoch"; reason: "live_anon_mismatch" } {
  if (input.isOwnerReply) return { action: "ok" };
  const chatAnon = parseAnonSessionFromChatId(input.chatId);
  const live = String(input.liveAnonId || "").trim();
  if (!chatAnon || !live.startsWith("anon_")) return { action: "ok" };
  if (chatAnon !== live) {
    return { action: "require_new_epoch", reason: "live_anon_mismatch" };
  }
  return { action: "ok" };
}

/**
 * On remove: which IP index docs to clear vs keep when another active block
 * still covers the same (receptor, ipHash).
 */
export function selectIpIndexesToClearOnRemove(input: {
  removingBlockId: string;
  receptorUid: string;
  removingIpHashes: string[];
  activeBlocks: Array<{
    id: string;
    status?: string;
    expiresAtMs?: number;
    blockedIpHash?: string;
    ipHashes?: string[];
  }>;
  nowMs?: number;
}): string[] {
  const nowMs = Number(input.nowMs || Date.now());
  const receptorUid = String(input.receptorUid || "").trim();
  const removingId = String(input.removingBlockId || "").trim();
  const hashes = Array.from(
    new Set(input.removingIpHashes.map((h) => String(h || "").trim()).filter(Boolean)),
  );
  const stillCovered = new Set<string>();
  for (const row of input.activeBlocks) {
    if (String(row.id || "") === removingId) continue;
    if (!isProfileAnonAbuseBlockActive(row, nowMs)) continue;
    const rowHashes = [
      String(row.blockedIpHash || "").trim(),
      ...(Array.isArray(row.ipHashes) ? row.ipHashes.map((h) => String(h || "").trim()) : []),
    ].filter(Boolean);
    for (const h of rowHashes) stillCovered.add(h);
  }
  return hashes.filter((h) => !stillCovered.has(h));
}

/**
 * Clear IP index on block remove only when this block owns the index doc.
 * Foreign index.blockId → never clear (read owner doc directly, not limit-N query).
 */
export function shouldClearIpIndexOnBlockRemove(input: {
  removingBlockId: string;
  indexBlockId: string;
  indexStatus: string;
}): boolean {
  if (String(input.indexStatus || "") === "removed") return false;
  const owner = String(input.indexBlockId || "").trim();
  if (!owner) return true;
  return owner === String(input.removingBlockId || "").trim();
}

/** Active block ids recorded on the IP index (legacy: sole blockId). */
export function readCoveringBlockIdsFromIndex(
  indexData: Record<string, unknown> | null | undefined,
): string[] {
  const raw = indexData?.coveringBlockIds;
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((id) => String(id || "").trim()).filter(Boolean)));
  }
  const owner = String(indexData?.blockId || "").trim();
  return owner ? [owner] : [];
}

export function mergeCoveringBlockIds(existing: string[], blockId: string): string[] {
  const id = String(blockId || "").trim();
  if (!id) return existing.slice();
  return Array.from(new Set([...existing, id]));
}

/** Drop removed/expired ids; keep every block still active for this hash. */
export function pruneCoveringBlockIdsForHash(input: {
  hash: string;
  blockIds: string[];
  blocksById: Map<
    string,
    {
      id?: string;
      status?: string;
      expiresAtMs?: number;
      blockedIpHash?: string;
      ipHashes?: string[];
    }
  >;
  nowMs?: number;
  /** Block being applied in the same tx — not yet in blocksById but must be kept. */
  ensureBlockId?: string;
}): string[] {
  const nowMs = Number(input.nowMs || Date.now());
  const hash = String(input.hash || "").trim();
  const ensure = String(input.ensureBlockId || "").trim();
  const seen = new Set<string>();
  const out: string[] = [];

  for (const rawId of [...input.blockIds, ...(ensure ? [ensure] : [])]) {
    const id = String(rawId || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (ensure && id === ensure) {
      out.push(id);
      continue;
    }
    const block = input.blocksById.get(id);
    if (block && blockCoversIpHash(block, hash, nowMs)) {
      out.push(id);
    }
  }
  return out;
}

export function blockCoversIpHash(
  block:
    | {
        status?: string;
        expiresAtMs?: number;
        blockedIpHash?: string;
        ipHashes?: string[];
      }
    | null
    | undefined,
  hash: string,
  nowMs = Date.now(),
): boolean {
  if (!block || !isProfileAnonAbuseBlockActive(block, nowMs)) return false;
  const target = String(hash || "").trim();
  if (!target) return false;
  const hashes = [
    String(block.blockedIpHash || "").trim(),
    ...(Array.isArray(block.ipHashes) ? block.ipHashes.map((h) => String(h || "").trim()) : []),
  ].filter(Boolean);
  return hashes.includes(target);
}

export type IpIndexSuccessor = {
  blockId: string;
  chatId: string;
  expiresAtMs: number;
  coveringBlockIds: string[];
};

/**
 * When removing the index owner, pick another active block that still covers the hash.
 */
export function resolveIpIndexSuccessorOnRemove(input: {
  removingBlockId: string;
  hash: string;
  coveringBlockIds: string[];
  blocksById: Map<
    string,
    {
      id: string;
      chatId?: string;
      status?: string;
      expiresAtMs?: number;
      blockedIpHash?: string;
      ipHashes?: string[];
    }
  >;
  nowMs?: number;
}): IpIndexSuccessor | null {
  const nowMs = Number(input.nowMs || Date.now());
  const removing = String(input.removingBlockId || "").trim();
  const hash = String(input.hash || "").trim();
  let best: IpIndexSuccessor | null = null;

  for (const id of input.coveringBlockIds) {
    if (id === removing) continue;
    const block = input.blocksById.get(id);
    if (!block || !blockCoversIpHash(block, hash, nowMs)) continue;
    const expiresAtMs = Number(block.expiresAtMs || 0);
    if (!best || expiresAtMs > best.expiresAtMs) {
      const coveringBlockIds = pruneCoveringBlockIdsForHash({
        hash,
        blockIds: input.coveringBlockIds,
        blocksById: input.blocksById,
        nowMs,
      }).filter((id) => id !== removing);
      best = {
        blockId: id,
        chatId: String(block.chatId || ""),
        expiresAtMs,
        coveringBlockIds,
      };
    }
  }
  return best;
}
export function resolveSendChatIdForLiveAnon(input: {
  chatId: string;
  username: string;
  liveAnonId: string;
}): { chatId: string; epochSwitched: boolean } {
  const chatId = String(input.chatId || "").trim();
  const live = String(input.liveAnonId || "").trim();
  const username = String(input.username || "").trim();
  const epoch = decideLiveAnonEpoch({
    chatId,
    liveAnonId: live,
    isOwnerReply: false,
  });
  if (epoch.action === "ok") {
    return { chatId, epochSwitched: false };
  }
  if (!live.startsWith("anon_") || !username) {
    throw Object.assign(new Error("epoch_resolve_failed"), { status: 409 });
  }
  const slug = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 80) || "usuario";
  const nextChatId = `${live}${ANON_TO_MARKER}${slug}`;
  if (!nextChatId || nextChatId === chatId) {
    throw Object.assign(new Error("epoch_resolve_failed"), { status: 409 });
  }
  return { chatId: nextChatId, epochSwitched: true };
}

/**
 * Canonical receptor UID from Firestore usuarios doc — doc.id wins; data.uid must match or collision.
 */
export function resolveCanonicalReceptorFromProfileDoc(input: {
  docId: string;
  data: Record<string, unknown>;
}): { ok: true; receptorUid: string } | { ok: false; error: string } {
  const docId = String(input.docId || "").trim();
  if (!docId) return { ok: false, error: "profile_missing_uid" };
  const fieldUid = String(input.data.uid || "").trim();
  if (fieldUid && fieldUid !== docId) {
    return { ok: false, error: "profile_uid_collision" };
  }
  return { ok: true, receptorUid: docId };
}

/**
 * Forbid cross-epoch legacy migration: only same-anon aliases, never other anon_/auth uids.
 */
export function filterSameEpochLegacyIds(canonicalChatId: string, legacyIds: string[]): string[] {
  const epochAnon = parseAnonSessionFromChatId(canonicalChatId);
  if (!epochAnon) return [];
  return legacyIds.filter((id) => {
    const other = parseAnonSessionFromChatId(id);
    return Boolean(other) && other === epochAnon && id !== canonicalChatId;
  });
}
