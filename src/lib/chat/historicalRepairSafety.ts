import { createHash, createHmac, timingSafeEqual } from "crypto";

/** Production must set HISTORICAL_REPAIR_EXPORT_SECRET; never commit the value. */
export const HISTORICAL_REPAIR_HMAC_SECRET_ENV = "HISTORICAL_REPAIR_EXPORT_SECRET";

export const HISTORICAL_REPAIR_SCHEMA_VERSION = 2;
export const HISTORICAL_REPAIR_PAGE_SIZE = 200;
export const HISTORICAL_REPAIR_WRITE_LIMIT = 25;

export const AUTHOR_BACKUP_KEYS = [
  "fromUid",
  "ownerId",
  "senderAuthUid",
  "senderProfileId",
  "senderRole",
  "senderKind",
  "profileUid",
] as const;

export const CHAT_SUMMARY_FIELD_KEYS = [
  "lastMessageSender",
  "latestSenderKind",
  "latestSenderAnonSessionId",
] as const;

export const CHAT_SUMMARY_AUTHOR_KEYS = CHAT_SUMMARY_FIELD_KEYS;

export type FieldPresence = "absent" | "null" | "present";

export type BackupField = {
  presence: FieldPresence;
  type: string;
  raw: unknown;
};

export type ApplyFrozenDenial = {
  ok: false;
  repairId: "";
  applied: [];
  noop: [];
  rejected: [];
  writes: 0;
  error: "apply_frozen";
  status: 403;
};

export function applyFrozenHttpBody() {
  return {
    ok: false as const,
    error: "apply_frozen" as const,
    writes: 0 as const,
    applied: [] as const,
    noop: [] as const,
    rejected: [] as const,
  };
}

export function applyFrozenDenial(): ApplyFrozenDenial {
  return {
    ok: false,
    repairId: "",
    applied: [],
    noop: [],
    rejected: [],
    writes: 0,
    error: "apply_frozen",
    status: 403,
  };
}

export function fieldPresenceOf(value: unknown, hasKey: boolean): FieldPresence {
  if (!hasKey) return "absent";
  if (value === null) return "null";
  return "present";
}

export function captureBackupField(doc: Record<string, unknown>, key: string): BackupField {
  const hasKey = Object.prototype.hasOwnProperty.call(doc, key);
  const raw = hasKey ? doc[key] : undefined;
  return {
    presence: fieldPresenceOf(raw, hasKey),
    type: raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw,
    raw: hasKey ? raw : undefined,
  };
}

export function restoreBackupField(
  target: Record<string, unknown>,
  key: string,
  field: BackupField,
  deleteSentinel: unknown,
) {
  if (field.presence === "absent") {
    target[key] = deleteSentinel;
    return;
  }
  target[key] = field.presence === "null" ? null : field.raw;
}

export function captureDocFields(
  doc: Record<string, unknown>,
  keys: readonly string[],
): Record<string, BackupField> {
  const out: Record<string, BackupField> = {};
  for (const key of keys) out[key] = captureBackupField(doc, key);
  return out;
}

export function restoreDocFields(
  target: Record<string, unknown>,
  backup: Record<string, BackupField>,
  deleteSentinel: unknown,
  allowedKeys: readonly string[] = AUTHOR_BACKUP_KEYS,
) {
  const allowed = new Set(allowedKeys);
  for (const [key, field] of Object.entries(backup)) {
    if (!allowed.has(key)) continue;
    if (!isValidBackupField(field)) continue;
    restoreBackupField(target, key, field, deleteSentinel);
  }
  return target;
}

export function hmacEqual(left: string, right: string) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function repairRowKey(collectionPath?: string, messageId?: string) {
  const path = String(collectionPath || "").trim();
  const id = String(messageId || "").trim();
  return path ? `${path}` : id;
}

export function isValidBackupField(field: unknown): field is BackupField {
  if (!field || typeof field !== "object" || Array.isArray(field)) return false;
  const row = field as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (key !== "presence" && key !== "type" && key !== "raw") return false;
  }
  const presence = String(row.presence || "");
  const type = String(row.type || "");
  if (presence === "absent") {
    return row.raw === undefined && (type === "undefined" || type === "");
  }
  if (presence === "null") {
    return row.raw === null && type === "null";
  }
  if (presence === "present") {
    if (row.raw === null || row.raw === undefined) return false;
    const actual = Array.isArray(row.raw) ? "array" : typeof row.raw;
    return type === actual;
  }
  return false;
}

export function opaqueExportId(secret: string, value: string) {
  const key = String(secret || "").trim();
  if (!key) throw new Error("repair_export_secret_required");
  return createHmac("sha256", key).update(String(value || "")).digest("hex").slice(0, 16);
}

export function repairExportSecret() {
  const secret = String(process.env.HISTORICAL_REPAIR_EXPORT_SECRET || "").trim();
  if (!secret) throw new Error("repair_export_secret_required");
  return secret;
}

export function signPreviewPlan(secret: string, previewHash: string) {
  const key = String(secret || "").trim();
  if (!key) throw new Error("repair_export_secret_required");
  return createHmac("sha256", key).update(String(previewHash || "")).digest("hex");
}

function requiredHmacSecret(secret?: string) {
  const key = String(secret || process.env.HISTORICAL_REPAIR_EXPORT_SECRET || "").trim();
  if (!key) throw new Error("repair_export_secret_required");
  return key;
}

export function operationIdForApply(input: {
  chatId: string;
  selections: Array<{
    messageId: string;
    desiredRole: string;
    expectedBeforeHash: string;
    collectionPath?: string;
    selectedAnonId?: string;
    afterHash?: string;
  }>;
  reason: string;
  requestStatus?: string;
  previewId?: string;
  previewHash?: string;
  schemaVersion?: number;
  operatorUid?: string;
  confirmWriteCount?: number;
  identity?: {
    ownerProfileId?: string;
    ownerUsernameSlug?: string;
    threadAnonId?: string;
    ownerIdSource?: string;
  };
  secret?: string;
}) {
  const payload = JSON.stringify({
    chatId: String(input.chatId || ""),
    reason: String(input.reason || ""),
    requestStatus: String(input.requestStatus || "apply"),
    previewId: String(input.previewId || ""),
    previewHash: String(input.previewHash || ""),
    schemaVersion: Number(input.schemaVersion || HISTORICAL_REPAIR_SCHEMA_VERSION),
    operatorUid: String(input.operatorUid || ""),
    confirmWriteCount: Number(input.confirmWriteCount || 0),
    identity: {
      ownerProfileId: String(input.identity?.ownerProfileId || ""),
      ownerUsernameSlug: String(input.identity?.ownerUsernameSlug || ""),
      threadAnonId: String(input.identity?.threadAnonId || ""),
      ownerIdSource: String(input.identity?.ownerIdSource || ""),
    },
    selections: [...input.selections]
      .map((row) => ({
        collectionPath: String(row.collectionPath || ""),
        messageId: String(row.messageId || ""),
        desiredRole: String(row.desiredRole || ""),
        expectedBeforeHash: String(row.expectedBeforeHash || ""),
        selectedAnonId: String(row.selectedAnonId || ""),
        afterHash: String(row.afterHash || ""),
      }))
      .sort((a, b) =>
        `${a.collectionPath}:${a.messageId}`.localeCompare(`${b.collectionPath}:${b.messageId}`),
      ),
  });
  return createHmac("sha256", requiredHmacSecret(input.secret)).update(payload).digest("hex");
}

export const PREVIEW_TTL_MS = 30 * 60 * 1000;

export type SealedPreviewSelection = {
  collectionPath: string;
  messageId: string;
  desiredRole: string;
  expectedBeforeHash: string;
  updateTime: string;
  selectedAnonId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export type SealedRepairPreview = {
  previewId: string;
  previewHash: string;
  chatId: string;
  schemaVersion: number;
  actorUid?: string;
  consumed?: boolean;
  identities?: {
    ownerProfileId: string;
    ownerUsernameSlug: string;
    threadAnonId: string;
    ownerIdSource: string;
  };
  chatUpdateTime?: string;
  latestMessageId?: string;
  latestCollectionPath?: string;
  selections: SealedPreviewSelection[];
  expiresAtMs: number;
  signature: string;
};

function canonicalSealedSelections(rows: SealedPreviewSelection[]) {
  return [...rows]
    .map((row) => ({
      collectionPath: String(row.collectionPath || ""),
      messageId: String(row.messageId || ""),
      desiredRole: String(row.desiredRole || ""),
      expectedBeforeHash: String(row.expectedBeforeHash || ""),
      updateTime: String(row.updateTime || ""),
      selectedAnonId: String(row.selectedAnonId || ""),
      before: row.before || undefined,
      after: row.after || undefined,
    }))
    .sort((a, b) =>
      `${a.collectionPath}:${a.messageId}`.localeCompare(`${b.collectionPath}:${b.messageId}`),
    );
}

export function sealReviewedPreview(
  input: {
    previewId: string;
    previewHash: string;
    chatId: string;
    selections: SealedPreviewSelection[];
    schemaVersion?: number;
    nowMs?: number;
    ttlMs?: number;
    actorUid?: string;
    identities?: SealedRepairPreview["identities"];
    chatUpdateTime?: string;
    latestMessageId?: string;
    latestCollectionPath?: string;
  },
  secret?: string,
): SealedRepairPreview {
  const expiresAtMs = Number(input.nowMs || Date.now()) + Number(input.ttlMs || PREVIEW_TTL_MS);
  const body = {
    previewId: String(input.previewId || ""),
    previewHash: String(input.previewHash || ""),
    chatId: String(input.chatId || ""),
    schemaVersion: Number(input.schemaVersion || HISTORICAL_REPAIR_SCHEMA_VERSION),
    actorUid: String(input.actorUid || ""),
    identities: {
      ownerProfileId: String(input.identities?.ownerProfileId || ""),
      ownerUsernameSlug: String(input.identities?.ownerUsernameSlug || ""),
      threadAnonId: String(input.identities?.threadAnonId || ""),
      ownerIdSource: String(input.identities?.ownerIdSource || ""),
    },
    chatUpdateTime: String(input.chatUpdateTime || ""),
    latestMessageId: String(input.latestMessageId || ""),
    latestCollectionPath: String(input.latestCollectionPath || ""),
    selections: canonicalSealedSelections(input.selections),
    expiresAtMs,
  };
  const signature = createHmac("sha256", requiredHmacSecret(secret))
    .update(JSON.stringify(body))
    .digest("hex");
  return { ...body, consumed: false, signature };
}

export function consumeSealedPreview(
  sealed: SealedRepairPreview | null | undefined,
  request: {
    chatId: string;
    previewId?: string;
    previewHash: string;
    selections: Array<{
      collectionPath?: string;
      messageId: string;
      desiredRole: string;
      expectedBeforeHash: string;
      updateTime?: string;
      selectedAnonId?: string;
    }>;
    nowMs?: number;
    actorUid?: string;
  },
  secret?: string,
) {
  if (!sealed || typeof sealed !== "object") {
    return { ok: false as const, error: "preview_missing" };
  }
  if (sealed.consumed === true) {
    return { ok: false as const, error: "preview_consumed" };
  }
  const nowMs = Number(request.nowMs || Date.now());
  if (!Number.isFinite(sealed.expiresAtMs) || nowMs > sealed.expiresAtMs) {
    return { ok: false as const, error: "preview_expired" };
  }
  const body = {
    previewId: String(sealed.previewId || ""),
    previewHash: String(sealed.previewHash || ""),
    chatId: String(sealed.chatId || ""),
    schemaVersion: Number(sealed.schemaVersion || 0),
    actorUid: String(sealed.actorUid || ""),
    identities: {
      ownerProfileId: String(sealed.identities?.ownerProfileId || ""),
      ownerUsernameSlug: String(sealed.identities?.ownerUsernameSlug || ""),
      threadAnonId: String(sealed.identities?.threadAnonId || ""),
      ownerIdSource: String(sealed.identities?.ownerIdSource || ""),
    },
    chatUpdateTime: String(sealed.chatUpdateTime || ""),
    latestMessageId: String(sealed.latestMessageId || ""),
    latestCollectionPath: String(sealed.latestCollectionPath || ""),
    selections: canonicalSealedSelections(sealed.selections || []),
    expiresAtMs: sealed.expiresAtMs,
  };
  const signature = createHmac("sha256", requiredHmacSecret(secret))
    .update(JSON.stringify(body))
    .digest("hex");
  if (!hmacEqual(signature, String(sealed.signature || ""))) {
    return { ok: false as const, error: "preview_signature_invalid" };
  }
  if (
    sealed.chatId !== String(request.chatId || "") ||
    sealed.previewHash !== String(request.previewHash || "") ||
    (request.previewId && sealed.previewId !== String(request.previewId || ""))
  ) {
    return { ok: false as const, error: "preview_mismatch" };
  }
  if (
    request.actorUid &&
    sealed.actorUid &&
    String(sealed.actorUid || "") !== String(request.actorUid || "")
  ) {
    return { ok: false as const, error: "preview_actor_mismatch" };
  }
  const sealedKey = JSON.stringify(
    canonicalSealedSelections(sealed.selections || []).map((row) => ({
      collectionPath: row.collectionPath,
      messageId: row.messageId,
      desiredRole: row.desiredRole,
      expectedBeforeHash: row.expectedBeforeHash,
      selectedAnonId: row.selectedAnonId,
    })),
  );
  const requestKey = JSON.stringify(
    canonicalSealedSelections(
      request.selections.map((row) => ({
        collectionPath: String(row.collectionPath || ""),
        messageId: String(row.messageId || ""),
        desiredRole: String(row.desiredRole || ""),
        expectedBeforeHash: String(row.expectedBeforeHash || ""),
        updateTime: String(row.updateTime || ""),
        selectedAnonId: String(row.selectedAnonId || ""),
      })),
    ).map((row) => ({
      collectionPath: row.collectionPath,
      messageId: row.messageId,
      desiredRole: row.desiredRole,
      expectedBeforeHash: row.expectedBeforeHash,
      selectedAnonId: row.selectedAnonId,
    })),
  );
  if (sealedKey !== requestKey) {
    return { ok: false as const, error: "preview_selection_mismatch" };
  }
  return { ok: true as const, error: "", preview: sealed };
}

export function messageCollectionPath(
  chatId: string,
  collectionName: "mensajes" | "messages",
  messageId: string,
) {
  return `chats/${chatId}/${collectionName}/${messageId}`;
}

export function parseMessageCollectionPath(path: string) {
  const match = String(path || "").trim().match(/^chats\/([^/]+)\/(mensajes|messages)\/([^/]+)$/);
  if (!match) return null;
  return {
    chatId: match[1],
    collectionName: match[2] as "mensajes" | "messages",
    messageId: match[3],
  };
}

export function repairIdForOperationId(operationId: string) {
  return `rep_${String(operationId || "").slice(0, 32)}`;
}

export function resolveIdempotentRepair(
  existing: { repairId: string; operationId: string; status?: string } | null,
  operationId: string,
) {
  const op = String(operationId || "").trim();
  if (!existing) {
    return { replay: false as const, repairId: repairIdForOperationId(op), error: "" };
  }
  if (existing.operationId !== op) {
    return { replay: false as const, repairId: existing.repairId, error: "operation_id_conflict" };
  }
  const status = String(existing.status || "").trim();
  if (status === "applied") {
    return { replay: true as const, repairId: existing.repairId, error: "" };
  }
  if (
    status === "rolled_back" ||
    status === "failed" ||
    status === "in_progress" ||
    status === "conflict"
  ) {
    return { replay: false as const, repairId: existing.repairId, error: "operation_status_conflict" };
  }
  return { replay: false as const, repairId: existing.repairId || repairIdForOperationId(op), error: "" };
}

export function hashReviewedPreviewPlan(input: {
  chatId: string;
  selections: Array<{
    messageId: string;
    desiredRole: string;
    expectedBeforeHash: string;
    updateTime?: string;
    collectionPath?: string;
    selectedAnonId?: string;
  }>;
  writeCount: number;
}) {
  const payload = JSON.stringify({
    chatId: String(input.chatId || ""),
    writeCount: Number(input.writeCount || 0),
    selections: [...input.selections]
      .map((row) => ({
        collectionPath: String(row.collectionPath || ""),
        selectedAnonId: String(row.selectedAnonId || ""),
        messageId: String(row.messageId || ""),
        desiredRole: String(row.desiredRole || ""),
        expectedBeforeHash: String(row.expectedBeforeHash || ""),
        updateTime: String(row.updateTime || ""),
      }))
      .sort((a, b) =>
        `${a.collectionPath}:${a.messageId}`.localeCompare(`${b.collectionPath}:${b.messageId}`),
      ),
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function previewIdForHash(planHash: string) {
  return `prv_${String(planHash || "").slice(0, 24)}`;
}

export function assertReviewedPreviewMatches(storedHash: string, liveHash: string) {
  if (!storedHash || !liveHash || storedHash !== liveHash) {
    return { ok: false as const, error: "preview_mismatch" };
  }
  return { ok: true as const, error: "" };
}

export function redactRepairExportValue(value: string) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.startsWith("anon_")) return "anon";
  if (raw.startsWith("profile_")) return "profile";
  return "uid";
}

export function inventoryBucketOnly(input: {
  high: number;
  medium: number;
  low: number;
  ambiguous: number;
}) {
  return {
    high: Number(input.high || 0),
    medium: Number(input.medium || 0),
    low: Number(input.low || 0),
    ambiguous: Number(input.ambiguous || 0),
    autoAssigned: 0,
  };
}

export function classifyInventoryConfidence(input: {
  identityOk: boolean;
  ownerSource?: string;
  missingSenderRole: number;
  alreadyCanonical: number;
  messageCount: number;
}): "high" | "medium" | "low" | "ambiguous" {
  if (!input.identityOk || input.ownerSource === "ambiguous_mismatch") {
    return "ambiguous";
  }
  if (input.missingSenderRole > 0 && input.alreadyCanonical === 0) return "high";
  if (input.missingSenderRole > 0) return "medium";
  return "low";
}

export function exportRepairPlanOpaque(
  plan: {
    applyAllowed: boolean;
    chatBlocked: boolean;
    blockReason: string;
    identities: {
      chatId: string;
      chatKind: string;
      threadAnonId: string;
      ownerIdSource: string;
      ownerProfileId: string;
    };
    selectedCount: number;
    writeCount: number;
    noopCount: number;
    errorCount: number;
    complementaryFailures: number;
    inbox: { lastMessageId: string; lastMessageSenderBefore: string; lastMessageSenderAfter: string };
    rows: Array<{
      messageId: string;
      selected: boolean;
      persisted: { fromUid: string; senderRole: string };
      proposed: { fromUid: string; senderRole: string } | null;
      expectedBeforeHash: string;
      updateTime: string;
      noop: boolean;
      error: string;
      before: unknown;
      after: unknown;
      complementary: boolean;
    }>;
  },
  secret = repairExportSecret(),
) {
  return {
    version: HISTORICAL_REPAIR_SCHEMA_VERSION,
    kind: "historical-authorship-repair-plan",
    applyAllowed: plan.applyAllowed,
    chatBlocked: plan.chatBlocked,
    blockReason: plan.blockReason,
    chatKind: plan.identities.chatKind,
    chatOpaqueId: opaqueExportId(secret, plan.identities.chatId),
    threadAnonOpaqueId: opaqueExportId(secret, plan.identities.threadAnonId),
    ownerIdSource: plan.identities.ownerIdSource,
    ownerPresent: Boolean(plan.identities.ownerProfileId),
    selectedCount: plan.selectedCount,
    writeCount: plan.writeCount,
    noopCount: plan.noopCount,
    errorCount: plan.errorCount,
    complementaryFailures: plan.complementaryFailures,
    inbox: {
      lastMessageOpaqueId: opaqueExportId(secret, plan.inbox.lastMessageId),
      lastFromShapeBefore: redactRepairExportValue(plan.inbox.lastMessageSenderBefore),
      lastFromShapeAfter: redactRepairExportValue(plan.inbox.lastMessageSenderAfter),
    },
    rows: plan.rows.map((row) => ({
      messageOpaqueId: opaqueExportId(secret, row.messageId),
      selected: row.selected,
      persistedShape: redactRepairExportValue(row.persisted.fromUid),
      persistedRole: row.persisted.senderRole || "",
      proposedRole: row.proposed?.senderRole || "",
      proposedShape: row.proposed ? redactRepairExportValue(row.proposed.fromUid) : "",
      occOpaque: opaqueExportId(secret, row.expectedBeforeHash),
      updateTimePresent: Boolean(row.updateTime),
      noop: row.noop,
      error: row.error,
      before: row.before,
      after: row.after,
      complementary: row.complementary,
    })),
  };
}

export function shouldIncludeDocMissingCreatedAt() {
  return true;
}

export function listedDocKey<T extends { id: string; collectionPath?: string; collectionName?: string }>(
  doc: T,
) {
  return String(doc.collectionPath || "").trim() || `${doc.collectionName || ""}:${doc.id}`;
}

export function mergeListedWithReread<T extends { id: string; collectionPath?: string; collectionName?: string }>(
  listed: T[],
  rereadByKey: Map<string, T>,
): T[] {
  return listed
    .filter((doc) => Boolean(doc?.id))
    .map((doc) => rereadByKey.get(listedDocKey(doc)) || doc);
}

export async function paginateFullSubcollection<
  T extends { id: string; collectionPath?: string; collectionName?: string },
>(options: {
  pageSize?: number;
  listPage: (pageToken: string) => Promise<{ docs: T[]; nextPageToken: string }>;
  rereadByIds: (ids: string[]) => Promise<T[]>;
}): Promise<T[]> {
  const pageSize = Number(options.pageSize || HISTORICAL_REPAIR_PAGE_SIZE) || HISTORICAL_REPAIR_PAGE_SIZE;
  const out: T[] = [];
  let pageToken = "";
  do {
    const page = await options.listPage(pageToken);
    const listed = (page.docs || []).filter((doc) => Boolean(doc?.id));
    const ids = listed.map((doc) => doc.id);
    const reread = ids.length ? await options.rereadByIds(ids) : [];
    const byKey = new Map(reread.map((doc) => [listedDocKey(doc), doc]));
    out.push(...mergeListedWithReread(listed, byKey));
    pageToken = String(page.nextPageToken || "");
    if ((page.docs || []).length < pageSize && !pageToken) break;
  } while (pageToken);
  return out;
}

export function shouldPatchChatSummary(
  chat: { latestMessageId?: string; latestCollectionPath?: string },
  messageId: string,
  collectionPath?: string,
) {
  const latest = String(chat.latestMessageId || "").trim();
  const id = String(messageId || "").trim();
  const latestPath = String(chat.latestCollectionPath || "").trim();
  const path = String(collectionPath || "").trim();
  if (!latest || !id || latest !== id) return false;
  if (latestPath && path && latestPath !== path) return false;
  return true;
}

export function resolveLatestMessageRef(
  chatId: string,
  latestMessageId: string,
  messages: Array<{ id: string; collectionPath?: string; collectionName?: string }>,
) {
  const id = String(latestMessageId || "").trim();
  if (!id) return { ok: true as const, path: "", error: "" };
  const matches = messages.filter((row) => row.id === id);
  if (matches.length > 1) {
    return { ok: false as const, path: "", error: "latest_message_ambiguous" };
  }
  if (matches.length === 1) {
    const name = matches[0].collectionName === "messages" ? "messages" : "mensajes";
    return {
      ok: true as const,
      path: String(matches[0].collectionPath || "").trim() || messageCollectionPath(chatId, name, id),
      error: "",
    };
  }
  return { ok: true as const, path: "", error: "" };
}

export function chatSummaryPatchFromAuthor(author: {
  fromUid: string;
  senderKind?: string;
  senderRole?: string;
}) {
  const kind = String(author.senderKind || author.senderRole || "");
  const fromUid = String(author.fromUid || "");
  return {
    lastMessageSender: fromUid,
    latestSenderKind: kind,
    latestSenderAnonSessionId: kind === "anon" && fromUid.startsWith("anon_") ? fromUid : "",
  };
}

export function chatInboxUnreadPatch(input: {
  nextSender: string;
  otherPartyId: string;
  readBy?: Record<string, unknown>;
  unreadCounts?: Record<string, unknown>;
}) {
  void input;
  return { readBy: undefined, unreadCounts: undefined, invented: false as const };
}

export function summaryAuthorFieldsFrom(doc: Record<string, unknown>) {
  return {
    lastMessageSender: String(doc.lastMessageSender || ""),
    latestSenderKind: String(doc.latestSenderKind || ""),
    latestSenderAnonSessionId: String(doc.latestSenderAnonSessionId || ""),
  };
}

export function summaryMatchesAfterPatch(
  live: Record<string, unknown>,
  afterPatch: Record<string, unknown>,
) {
  const liveFields = summaryAuthorFieldsFrom(live);
  const want = summaryAuthorFieldsFrom(afterPatch);
  return (
    liveFields.lastMessageSender === want.lastMessageSender &&
    liveFields.latestSenderKind === want.latestSenderKind &&
    liveFields.latestSenderAnonSessionId === want.latestSenderAnonSessionId
  );
}

export function rollbackSummaryGate(input: {
  liveLatestMessageId?: string;
  plannedLatestMessageId?: string;
  liveSummary: Record<string, unknown>;
  afterPatch: Record<string, unknown>;
}) {
  if (
    String(input.liveLatestMessageId || "") !== String(input.plannedLatestMessageId || "")
  ) {
    return { ok: false as const, error: "new_message_before_rollback" };
  }
  if (!summaryMatchesAfterPatch(input.liveSummary, input.afterPatch)) {
    return { ok: false as const, error: "summary_diverged" };
  }
  return { ok: true as const, error: "" };
}

export function validateApplySelections(
  selections: Array<{
    messageId: string;
    desiredRole: string;
    collectionName?: string;
    collectionPath?: string;
  }>,
  identities?: { ownerIdSource?: string },
) {
  if (identities?.ownerIdSource === "ambiguous_mismatch") {
    return { ok: false as const, error: "owner_identity_ambiguous" };
  }
  const seen = new Map<string, string>();
  for (const row of selections) {
    const id = String(row.messageId || "").trim();
    const role = String(row.desiredRole || "").trim();
    const path = String(row.collectionPath || "").trim();
    const name = String(row.collectionName || "").trim();
    if (!id) return { ok: false as const, error: "empty_message_id" };
    if (role !== "profile" && role !== "anon") {
      return { ok: false as const, error: "invalid_desired_role" };
    }
    const key = path || (name ? `${name}:${id}` : "");
    if (!key) return { ok: false as const, error: "collection_path_required" };
    if (seen.has(key)) {
      if (seen.get(key) !== role) return { ok: false as const, error: "owner_conflict" };
      return { ok: false as const, error: "duplicate_message_id" };
    }
    seen.set(key, role);
  }
  return { ok: true as const, error: "" };
}

export function validateRepairSchema(input: {
  schemaVersion?: number | null;
  writeCount: number;
  backupMessageIds: string[];
  backupRowKeys?: string[];
  fields?: Record<string, BackupField>;
  collectionNames?: string[];
}) {
  if (input.schemaVersion == null || Number(input.schemaVersion) === 0) {
    return { ok: false as const, error: "schema_version_missing" };
  }
  if (Number(input.schemaVersion) !== HISTORICAL_REPAIR_SCHEMA_VERSION) {
    return { ok: false as const, error: "schema_version_mismatch" };
  }
  if (Number(input.writeCount) > HISTORICAL_REPAIR_WRITE_LIMIT) {
    return { ok: false as const, error: "batch_limit" };
  }
  const ids = input.backupMessageIds.map((id) => String(id || "").trim()).filter(Boolean);
  if (ids.length !== input.backupMessageIds.length) {
    return { ok: false as const, error: "backup_path_invalid" };
  }
  const uniqueness = input.backupRowKeys?.length
    ? input.backupRowKeys.map((key) => String(key || "").trim()).filter(Boolean)
    : ids;
  if (uniqueness.length !== (input.backupRowKeys?.length || ids.length)) {
    return { ok: false as const, error: "backup_path_invalid" };
  }
  if (new Set(uniqueness).size !== uniqueness.length) {
    return { ok: false as const, error: "backup_not_unique" };
  }
  if (input.fields) {
    for (const field of Object.values(input.fields)) {
      if (!field || !["absent", "null", "present"].includes(String(field.presence || ""))) {
        return { ok: false as const, error: "backup_corrupt" };
      }
    }
  }
  if (input.collectionNames) {
    for (const name of input.collectionNames) {
      if (name !== "mensajes" && name !== "messages") {
        return { ok: false as const, error: "backup_path_invalid" };
      }
    }
  }
  return { ok: true as const, error: "" };
}

export type OccMessageSnapshot = {
  messageId: string;
  updateTime: string;
  beforeHash: string;
  kind: "apply" | "noop";
};

export type OccSnapshot = {
  identityOk: boolean;
  identityError: string;
  chatUpdateTime: string;
  repairUpdateTime: string;
  messages: OccMessageSnapshot[];
};

export function canonicalFirestoreUpdateTime(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    const row = value as {
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    };
    const seconds = Number(row.seconds ?? row._seconds);
    const nanos = Number(row.nanoseconds ?? row._nanoseconds);
    if (Number.isFinite(seconds) && Number.isFinite(nanos)) {
      return `${seconds}.${String(Math.trunc(nanos)).padStart(9, "0")}`;
    }
  }
  const raw = String(value);
  if (/^-?\d+\.\d{9}$/.test(raw)) return raw;
  return `raw:${raw}`;
}

export type RepairTimeTuple = { seconds: bigint; nanos: number };

export function createdAtTimeTuple(value: unknown): RepairTimeTuple | null {
  if (value == null || value === "") return null;
  if (typeof value === "object") {
    const row = value as {
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
      toMillis?: () => number;
    };
    const seconds = row.seconds ?? row._seconds;
    const nanos = row.nanoseconds ?? row._nanoseconds;
    if (seconds != null && Number.isFinite(Number(seconds))) {
      return {
        seconds: BigInt(Math.trunc(Number(seconds))),
        nanos: Number.isFinite(Number(nanos)) ? Math.trunc(Number(nanos)) : 0,
      };
    }
    if (typeof row.toMillis === "function") {
      const ms = row.toMillis();
      if (!Number.isFinite(ms)) return null;
      return {
        seconds: BigInt(Math.floor(ms / 1000)),
        nanos: Math.trunc((ms % 1000) * 1e6),
      };
    }
  }
  const raw = String(value);
  if (raw.startsWith("raw:")) return null;
  const token = raw.match(/^(-?\d+)\.(\d{9})$/);
  if (token) {
    return { seconds: BigInt(token[1]), nanos: Number(token[2]) };
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return {
    seconds: BigInt(Math.floor(ms / 1000)),
    nanos: Math.trunc((ms % 1000) * 1e6),
  };
}

export function createdAtSortKey(value: unknown): bigint | null {
  const tuple = createdAtTimeTuple(value);
  if (!tuple) return null;
  return tuple.seconds * BigInt(1_000_000_000) + BigInt(tuple.nanos);
}

export function compareTimeTuples(a: RepairTimeTuple, b: RepairTimeTuple) {
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  if (a.nanos !== b.nanos) return a.nanos < b.nanos ? -1 : 1;
  return 0;
}

export function compareRepairMessagesChronological(
  a: { id?: string; createdAt?: unknown; createTime?: unknown },
  b: { id?: string; createdAt?: unknown; createTime?: unknown },
) {
  const aTuple = createdAtTimeTuple(a.createdAt) || createdAtTimeTuple(a.createTime);
  const bTuple = createdAtTimeTuple(b.createdAt) || createdAtTimeTuple(b.createTime);
  if (!aTuple && !bTuple) return String(a.id || "").localeCompare(String(b.id || ""));
  if (!aTuple) return 1;
  if (!bTuple) return -1;
  const cmp = compareTimeTuples(aTuple, bTuple);
  if (cmp !== 0) return cmp;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

const BACKUP_ROW_KEYS = new Set([
  "messageId",
  "before",
  "after",
  "updateTime",
  "fields",
  "collectionName",
  "collectionPath",
]);

const AUTHOR_BACKUP_KEY_SET = new Set<string>(AUTHOR_BACKUP_KEYS);
const CHAT_BACKUP_KEY_SET = new Set<string>(CHAT_SUMMARY_FIELD_KEYS);
const CHAT_BACKUP_ROOT_KEYS = new Set([
  "patched",
  "fields",
  "afterPatch",
  "latestMessageId",
  "latestCollectionPath",
  "writeCount",
  "backupDigest",
]);

export type ParsedRepairBackupRow = {
  messageId: string;
  before: PersistedAuthorLike;
  after: PersistedAuthorLike;
  updateTime: string;
  fields: Record<string, BackupField>;
  collectionName: "mensajes" | "messages";
  collectionPath: string;
};

type PersistedAuthorLike = {
  fromUid?: string;
  senderAuthUid?: string;
  senderProfileId?: string;
  senderRole?: string;
  senderKind?: string;
  ownerId?: string;
  profileUid?: string;
};

function parseAuthorObject(value: unknown, label: "before" | "after") {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false as const, error: `backup_${label}_missing` };
  }
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (!AUTHOR_BACKUP_KEY_SET.has(key)) {
      return { ok: false as const, error: "backup_extra_key" };
    }
    if (row[key] != null && typeof row[key] !== "string") {
      return { ok: false as const, error: "backup_corrupt" };
    }
  }
  return { ok: true as const, value: row as PersistedAuthorLike, error: "" };
}

function parseFieldsObject(
  value: unknown,
  allowed: Set<string>,
  requireAll: boolean,
) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false as const, error: "backup_fields_missing" };
  }
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (!allowed.has(key)) return { ok: false as const, error: "backup_extra_key" };
    if (!isValidBackupField(row[key])) return { ok: false as const, error: "backup_field_invalid" };
  }
  if (requireAll) {
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) {
        return { ok: false as const, error: "backup_fields_missing" };
      }
    }
  }
  return { ok: true as const, value: row as Record<string, BackupField>, error: "" };
}

export function parseRepairBackupJson(raw: string) {
  try {
    const parsed = JSON.parse(String(raw || ""));
    if (!Array.isArray(parsed)) return { ok: false as const, error: "backup_corrupt" };
    const rows: ParsedRepairBackupRow[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { ok: false as const, error: "backup_corrupt" };
      }
      const row = item as Record<string, unknown>;
      for (const key of Object.keys(row)) {
        if (!BACKUP_ROW_KEYS.has(key)) {
          return { ok: false as const, error: "backup_extra_key" };
        }
      }
      for (const required of ["messageId", "before", "after", "fields", "updateTime", "collectionPath"] as const) {
        if (!Object.prototype.hasOwnProperty.call(row, required) || row[required] == null) {
          return { ok: false as const, error: `backup_${required}_missing` };
        }
      }
      const messageId = String(row.messageId || "").trim();
      if (!messageId) return { ok: false as const, error: "empty_message_id" };
      if (typeof row.updateTime !== "string" || !row.updateTime) {
        return { ok: false as const, error: "backup_updateTime_missing" };
      }
      if (typeof row.collectionPath !== "string") {
        return { ok: false as const, error: "backup_path_invalid" };
      }
      const parsedPath = parseMessageCollectionPath(row.collectionPath);
      if (!parsedPath || parsedPath.messageId !== messageId) {
        return { ok: false as const, error: "backup_path_invalid" };
      }
      if (row.collectionName != null && row.collectionName !== parsedPath.collectionName) {
        return { ok: false as const, error: "backup_path_invalid" };
      }
      const before = parseAuthorObject(row.before, "before");
      if (!before.ok) return { ok: false as const, error: before.error };
      const after = parseAuthorObject(row.after, "after");
      if (!after.ok) return { ok: false as const, error: after.error };
      const fields = parseFieldsObject(row.fields, AUTHOR_BACKUP_KEY_SET, true);
      if (!fields.ok) return { ok: false as const, error: fields.error };
      rows.push({
        messageId,
        before: before.value,
        after: after.value,
        updateTime: row.updateTime,
        fields: fields.value,
        collectionName: parsedPath.collectionName,
        collectionPath: row.collectionPath,
      });
    }
    return { ok: true as const, rows, error: "" };
  } catch {
    return { ok: false as const, error: "backup_corrupt" };
  }
}

export function parseChatBackupJson(raw: string) {
  try {
    const parsed = JSON.parse(String(raw || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false as const, error: "chat_backup_corrupt" };
    }
    const row = parsed as Record<string, unknown>;
    for (const key of Object.keys(row)) {
      if (!CHAT_BACKUP_ROOT_KEYS.has(key)) {
        return { ok: false as const, error: "chat_backup_extra_key" };
      }
    }
    if (typeof row.patched !== "boolean") {
      return { ok: false as const, error: "chat_backup_patched_invalid" };
    }
    const fields = parseFieldsObject(row.fields, CHAT_BACKUP_KEY_SET, row.patched === true);
    if (!fields.ok) {
      return {
        ok: false as const,
        error: fields.error === "backup_extra_key" ? "chat_backup_extra_key" : "chat_backup_corrupt",
      };
    }
    if (row.afterPatch != null && (typeof row.afterPatch !== "object" || Array.isArray(row.afterPatch))) {
      return { ok: false as const, error: "chat_backup_corrupt" };
    }
    if (row.afterPatch && typeof row.afterPatch === "object") {
      for (const key of Object.keys(row.afterPatch as Record<string, unknown>)) {
        if (!CHAT_BACKUP_KEY_SET.has(key)) {
          return { ok: false as const, error: "chat_backup_extra_key" };
        }
      }
    }
    return {
      ok: true as const,
      parsed: {
        patched: row.patched,
        fields: fields.value,
        afterPatch: row.afterPatch as Record<string, unknown> | undefined,
        latestMessageId: row.latestMessageId == null ? "" : String(row.latestMessageId),
        latestCollectionPath: row.latestCollectionPath == null ? "" : String(row.latestCollectionPath),
        writeCount: row.writeCount == null ? undefined : Number(row.writeCount),
        backupDigest: row.backupDigest == null ? "" : String(row.backupDigest),
      },
      error: "",
    };
  } catch {
    return { ok: false as const, error: "chat_backup_corrupt" };
  }
}

export function computeBackupDigest(
  input: { writeCount: number; backupJson: string; chatBackupJson?: string },
  secret?: string,
) {
  return createHmac("sha256", requiredHmacSecret(secret))
    .update(
      JSON.stringify({
        writeCount: Number(input.writeCount || 0),
        backupJson: String(input.backupJson || ""),
        chatBackupJson: String(input.chatBackupJson || ""),
      }),
    )
    .digest("hex");
}

export function verifyBackupIntegrity(input: {
  writeCount: number;
  backupJson: string;
  chatBackupJson?: string;
  digest: string;
  expectedWriteCount?: number;
}) {
  const parsed = parseRepairBackupJson(input.backupJson);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  if (parsed.rows.length !== Number(input.writeCount || 0)) {
    return { ok: false as const, error: "backup_truncated" };
  }
  if (
    input.expectedWriteCount != null &&
    Number(input.expectedWriteCount) !== Number(input.writeCount || 0)
  ) {
    return { ok: false as const, error: "backup_write_count_mismatch" };
  }
  const digest = computeBackupDigest({
    writeCount: input.writeCount,
    backupJson: input.backupJson,
    chatBackupJson: input.chatBackupJson,
  });
  if (!hmacEqual(digest, String(input.digest || ""))) {
    return { ok: false as const, error: "backup_digest_mismatch" };
  }
  return { ok: true as const, error: "", rows: parsed.rows };
}

export function evaluateOccAllOrNone(expected: OccSnapshot, live: OccSnapshot) {
  if (!live.identityOk) {
    return { ok: false as const, error: live.identityError || "identity_changed" };
  }
  if (expected.identityOk !== live.identityOk || expected.identityError !== live.identityError) {
    return { ok: false as const, error: "identity_changed" };
  }
  if (String(expected.chatUpdateTime || "") !== String(live.chatUpdateTime || "")) {
    return { ok: false as const, error: "chat_update_time_mismatch" };
  }
  if (String(expected.repairUpdateTime || "") !== String(live.repairUpdateTime || "")) {
    return { ok: false as const, error: "repair_update_time_mismatch" };
  }
  if (expected.messages.length !== live.messages.length) {
    return { ok: false as const, error: "occ_message_set_mismatch" };
  }
  for (let i = 0; i < expected.messages.length; i += 1) {
    const want = expected.messages[i];
    const got = live.messages[i];
    if (want.messageId !== got.messageId) {
      return { ok: false as const, error: "occ_message_set_mismatch" };
    }
    if (
      canonicalFirestoreUpdateTime(want.updateTime) !==
        canonicalFirestoreUpdateTime(got.updateTime) ||
      want.beforeHash !== got.beforeHash
    ) {
      return {
        ok: false as const,
        error: want.kind === "noop" ? "noop_race" : "stale_update_time",
      };
    }
  }
  return { ok: true as const, error: "" };
}

export function keepExistingAnonSenderAuthUid(
  persistedSenderAuthUid: string | undefined,
): string {
  return String(persistedSenderAuthUid || "").trim();
}
