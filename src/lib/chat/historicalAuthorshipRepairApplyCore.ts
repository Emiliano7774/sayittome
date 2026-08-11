/**
 * Injected-backend apply-rollback orchestration.
 * Backend is mandatory. No Admin SDK imports.
 * Production writer must freeze BEFORE calling this module.
 */
import {
  classifyApplySelections,
  classifyRollbackRows,
  evaluateThreadIdentity,
  expectedBeforeHash,
  type ApplySelection,
  type PersistedAuthor,
  type ProposedAuthor,
  type RepairMessageInput,
  type ThreadIdentities,
} from "@/lib/chat/historicalAuthorshipRepair";
import {
  assertReviewedPreviewMatches,
  AUTHOR_BACKUP_KEYS,
  captureDocFields,
  CHAT_SUMMARY_FIELD_KEYS,
  chatSummaryPatchFromAuthor,
  computeBackupDigest,
  hashReviewedPreviewPlan,
  parseChatBackupJson,
  parseRepairBackupJson,
  HISTORICAL_REPAIR_SCHEMA_VERSION,
  keepExistingAnonSenderAuthUid,
  consumeSealedPreview,
  messageCollectionPath,
  operationIdForApply,
  resolveLatestMessageRef,
  resolveIdempotentRepair,
  shouldPatchChatSummary,
  summaryAuthorFieldsFrom,
  validateApplySelections,
  validateRepairSchema,
  verifyBackupIntegrity,
  type BackupField,
  type OccSnapshot,
  type SealedRepairPreview,
} from "@/lib/chat/historicalRepairSafety";

export function messageCollectionName(value?: string): "mensajes" | "messages" {
  return value === "messages" ? "messages" : "mensajes";
}

export type HistoricalRepairWriteResult = {
  ok: boolean;
  repairId: string;
  applied: Array<{ messageId: string; status: string; reason: string }>;
  noop: Array<{ messageId: string; status: string; reason: string }>;
  rejected: Array<{ messageId: string; status: string; reason: string }>;
  writes: number;
  error: string;
  status?: number;
  replayed?: boolean;
};

export type RepairDocSnapshot = {
  repairId: string;
  operationId: string;
  status: string;
  chatId?: string;
  updateTime?: string;
  previewHash?: string;
  backupJson?: string;
  chatBackupJson?: string;
  schemaVersion?: number;
  writeCount?: number;
  backupDigest?: string;
  applied?: Array<{ messageId: string; status: string; reason: string }>;
  noop?: Array<{ messageId: string; status: string; reason: string }>;
};

export type ChatSummarySnapshot = {
  latestMessageId?: string;
  latestCollectionPath?: string;
  lastMessageSender?: string;
  latestSenderKind?: string;
  latestSenderAnonSessionId?: string;
  readBy?: Record<string, unknown>;
  unreadCounts?: Record<string, unknown>;
  updateTime?: string;
  receptorUid?: string;
  anonOwnerUid?: string;
  raw?: Record<string, unknown>;
  exists?: boolean;
};

export type HistoricalRepairBackend = {
  getRepairById: (repairId: string) => Promise<RepairDocSnapshot | null>;
  getPreview?: (previewId: string) => Promise<SealedRepairPreview | null>;
  loadThread: (chatId: string) => Promise<{
    identities: ThreadIdentities;
    messages: RepairMessageInput[];
    chat: ChatSummarySnapshot;
    messageDocs: Record<string, Record<string, unknown>>;
  }>;
  commitApply: (plan: PreparedApplyPlan) => Promise<void>;
  commitRollback: (plan: PreparedRollbackPlan) => Promise<void>;
};

export type PreparedApplyPlan = {
  repairId: string;
  operationId: string;
  previewId: string;
  previewHash: string;
  chatId: string;
  reason: string;
  operatorUid: string;
  operatorEmail: string;
  identities: ThreadIdentities;
  occ: OccSnapshot;
  schemaVersion: number;
  applied: Array<{
    messageId: string;
    before: PersistedAuthor;
    after: ProposedAuthor;
    updateTime: string;
    fields: Record<string, BackupField>;
    collectionName?: "mensajes" | "messages";
    collectionPath: string;
  }>;
  noop: Array<{
    messageId: string;
    updateTime: string;
    beforeHash: string;
    collectionName?: "mensajes" | "messages";
    collectionPath: string;
  }>;
  patchChatSummary: boolean;
  chatAfterPatch?: Record<string, unknown>;
  plannedLatestMessageId?: string;
  chatUpdateTime: string;
  chatBackup: Record<string, BackupField>;
  chatPatch: Record<string, unknown>;
  writeCount: number;
  backupDigest: string;
  consumePreviewId: string;
};

export type PreparedRollbackPlan = {
  repairId: string;
  chatId: string;
  identities: ThreadIdentities;
  repairUpdateTime: string;
  chatUpdateTime: string;
  occ: OccSnapshot;
  restore: Array<{
    messageId: string;
    updateTime: string;
    fields: Record<string, BackupField>;
    collectionName?: "mensajes" | "messages";
    collectionPath: string;
  }>;
  noop: Array<{
    messageId: string;
    updateTime: string;
    beforeHash: string;
    collectionName?: "mensajes" | "messages";
    collectionPath: string;
  }>;
  restoreChatSummary: boolean;
  chatAfterPatch?: Record<string, unknown>;
  plannedLatestMessageId?: string;
  chatBackup: Record<string, BackupField>;
  operatorEmail: string;
  reason: string;
};

function deny(error: string, extras?: Partial<HistoricalRepairWriteResult>): HistoricalRepairWriteResult {
  return {
    ok: false,
    repairId: extras?.repairId || "",
    applied: extras?.applied || [],
    noop: extras?.noop || [],
    rejected: extras?.rejected || [],
    writes: 0,
    replayed: extras?.replayed,
    error,
    status: extras?.status,
  };
}

export function keepCanonicalAnonAuthor(
  proposed: ProposedAuthor,
  persisted?: PersistedAuthor,
): ProposedAuthor {
  if (proposed.senderRole !== "anon") return proposed;
  return {
    ...proposed,
    senderAuthUid: keepExistingAnonSenderAuthUid(persisted?.senderAuthUid),
  };
}

export function buildOccSnapshot(input: {
  identities: ThreadIdentities;
  chatUpdateTime: string;
  repairUpdateTime: string;
  rows: Array<{ messageId: string; updateTime: string; beforeHash: string; kind: "apply" | "noop" }>;
}): OccSnapshot {
  const identity = evaluateThreadIdentity(input.identities);
  return {
    identityOk: identity.ok,
    identityError: identity.error,
    chatUpdateTime: String(input.chatUpdateTime || ""),
    repairUpdateTime: String(input.repairUpdateTime || ""),
    messages: input.rows.map((row) => ({
      messageId: row.messageId,
      updateTime: String(row.updateTime || ""),
      beforeHash: String(row.beforeHash || ""),
      kind: row.kind,
    })),
  };
}

export async function runApplyHistoricalRepair(input: {
  chatId: string;
  selections: ApplySelection[];
  reason: string;
  confirmWriteCount: number;
  operatorUid: string;
  operatorEmail: string;
  previewId?: string;
  previewHash?: string;
  operationId?: string;
  sealedPreview?: SealedRepairPreview;
  backend: HistoricalRepairBackend;
}): Promise<HistoricalRepairWriteResult> {
  if (!input.backend) return deny("backend_required");
  const backend = input.backend;

  const chatId = String(input.chatId || "").trim();
  const selections = input.selections || [];
  const reason = String(input.reason || "").trim();
  const duplicates = validateApplySelections(selections);
  if (!duplicates.ok) return deny(duplicates.error);

  const previewId = String(input.previewId || input.sealedPreview?.previewId || "").trim();
  const previewHash = String(input.previewHash || input.sealedPreview?.previewHash || "").trim();
  if (!previewId) return deny("preview_missing");
  const storedPreview = backend.getPreview ? await backend.getPreview(previewId) : null;
  if (backend.getPreview && !storedPreview) return deny("preview_missing");
  const sealedSource = storedPreview || input.sealedPreview;
  const sealed = consumeSealedPreview(sealedSource, {
    chatId,
    previewId,
    previewHash,
    actorUid: input.operatorUid,
    selections: selections.map((row) => ({
      collectionPath: row.collectionPath,
      messageId: row.messageId,
      desiredRole: row.desiredRole,
      expectedBeforeHash: row.expectedBeforeHash,
      updateTime: row.updateTime,
      selectedAnonId: row.selectedAnonId,
    })),
  });
  if (!sealed.ok) return deny(sealed.error);
  const reviewed = sealed.preview;

  const computedOperationId = operationIdForApply({
    chatId,
    reason,
    requestStatus: "apply",
    previewId,
    previewHash,
    schemaVersion: HISTORICAL_REPAIR_SCHEMA_VERSION,
    operatorUid: input.operatorUid,
    confirmWriteCount: input.confirmWriteCount,
    identity: reviewed.identities,
    selections: selections.map((row) => ({
      collectionPath: row.collectionPath,
      messageId: row.messageId,
      desiredRole: row.desiredRole,
      expectedBeforeHash: row.expectedBeforeHash,
      selectedAnonId: row.selectedAnonId,
      afterHash: expectedBeforeHash({
        fromUid: String(reviewed.selections.find((item) =>
          item.collectionPath === String(row.collectionPath || "") &&
          item.messageId === row.messageId,
        )?.after?.fromUid || ""),
        senderAuthUid: String(reviewed.selections.find((item) =>
          item.collectionPath === String(row.collectionPath || "") &&
          item.messageId === row.messageId,
        )?.after?.senderAuthUid || ""),
        senderProfileId: String(reviewed.selections.find((item) =>
          item.collectionPath === String(row.collectionPath || "") &&
          item.messageId === row.messageId,
        )?.after?.senderProfileId || ""),
        senderRole: String(reviewed.selections.find((item) =>
          item.collectionPath === String(row.collectionPath || "") &&
          item.messageId === row.messageId,
        )?.after?.senderRole || ""),
        senderKind: String(reviewed.selections.find((item) =>
          item.collectionPath === String(row.collectionPath || "") &&
          item.messageId === row.messageId,
        )?.after?.senderKind || ""),
      }),
    })),
  });
  const providedOperationId = String(input.operationId || "").trim();
  if (providedOperationId && providedOperationId !== computedOperationId) {
    return deny("operation_id_conflict");
  }
  const operationId = computedOperationId;
  const repairId = `rep_${String(operationId || "").slice(0, 32)}`;

  const existing = await backend.getRepairById(repairId);
  const idempotent = resolveIdempotentRepair(
    existing
      ? {
          repairId: existing.repairId,
          operationId: existing.operationId,
          status: existing.status,
        }
      : null,
    operationId,
  );
  if (idempotent.error) return deny(idempotent.error, { repairId: idempotent.repairId });
  if (idempotent.replay) {
    return {
      ok: true,
      repairId: idempotent.repairId,
      applied: existing?.applied || [],
      noop: existing?.noop || [],
      rejected: [],
      writes: Number(existing?.writeCount || 0),
      error: "",
      replayed: true,
    };
  }

  const loaded = await backend.loadThread(chatId);
  if (loaded.chat.exists === false) return deny("chat_doc_missing");
  const latestRef = resolveLatestMessageRef(
    chatId,
    String(loaded.chat.latestMessageId || ""),
    loaded.messages,
  );
  if (!latestRef.ok) return deny(latestRef.error);
  if (
    (reviewed.identities?.ownerProfileId &&
      reviewed.identities.ownerProfileId !== loaded.identities.ownerProfileId) ||
    (reviewed.identities?.threadAnonId &&
      reviewed.identities.threadAnonId !== loaded.identities.threadAnonId) ||
    (reviewed.chatUpdateTime &&
      reviewed.chatUpdateTime !== String(loaded.chat.updateTime || "")) ||
    (reviewed.latestMessageId &&
      reviewed.latestMessageId !== String(loaded.chat.latestMessageId || "")) ||
    (reviewed.latestCollectionPath &&
      latestRef.path &&
      reviewed.latestCollectionPath !== latestRef.path)
  ) {
    return deny("preview_stale");
  }
  const identityGate = validateApplySelections(selections, loaded.identities);
  if (!identityGate.ok) return deny(identityGate.error);

  const classified = classifyApplySelections({
    identities: loaded.identities,
    live: loaded.messages,
    selections,
    confirmWriteCount: input.confirmWriteCount,
    reason,
  });
  if (classified.blocked) {
    return deny(classified.blockReason, {
      applied: classified.applied,
      noop: classified.noop,
      rejected: classified.rejected,
    });
  }
  if (classified.rejected.length > 0) {
    return deny(classified.rejected[0]?.reason || "apply_rejected", {
      applied: classified.applied,
      noop: classified.noop,
      rejected: classified.rejected,
    });
  }

  const liveHash = hashReviewedPreviewPlan({
    chatId,
    writeCount: classified.applied.length,
    selections,
  });
  const previewCheck = assertReviewedPreviewMatches(previewHash, liveHash);
  if (!previewCheck.ok) return deny(previewCheck.error);

  let appliedRows: PreparedApplyPlan["applied"];
  try {
  appliedRows = classified.applied.map((row) => {
    const collectionPath = String(row.collectionPath || "").trim();
    if (!collectionPath) {
      throw new Error("collection_path_required");
    }
    const sealedRow = reviewed.selections.find(
      (item) => item.collectionPath === collectionPath && item.messageId === row.messageId,
    );
    const sealedAfter = sealedRow?.after as ProposedAuthor | undefined;
    if (!sealedAfter) {
      throw new Error("preview_after_missing");
    }
    const after = keepCanonicalAnonAuthor(sealedAfter, row.before);
    const live = loaded.messages.find((item) => item.collectionPath === collectionPath);
    const collectionName = messageCollectionName(
      row.collectionName || live?.collectionName || "",
    );
    const doc = loaded.messageDocs[collectionPath] || {};
    return {
      messageId: row.messageId,
      before: row.before as PersistedAuthor,
      after,
      updateTime: row.updateTime || "",
      fields: captureDocFields(doc, AUTHOR_BACKUP_KEYS),
      collectionName,
      collectionPath,
    };
  });
  } catch (error) {
    return deny(String((error as Error).message || "preview_after_missing"));
  }

  const schema = validateRepairSchema({
    schemaVersion: HISTORICAL_REPAIR_SCHEMA_VERSION,
    writeCount: appliedRows.length,
    backupMessageIds: appliedRows.map((row) => row.messageId),
    backupRowKeys: appliedRows.map((row) => row.collectionPath),
  });
  if (!schema.ok) return deny(schema.error);

  const chatWithLatestPath = {
    ...loaded.chat,
    latestCollectionPath: latestRef.path || loaded.chat.latestCollectionPath,
  };
  const summaryMessage =
    appliedRows.find((row) =>
      shouldPatchChatSummary(chatWithLatestPath, row.messageId, row.collectionPath),
    ) ||
    classified.noop.find((row) =>
      shouldPatchChatSummary(chatWithLatestPath, row.messageId, row.collectionPath),
    );
  const summaryAuthor =
    (summaryMessage && "after" in summaryMessage ? summaryMessage.after : null) ||
    appliedRows.find((row) => row.collectionPath === latestRef.path)?.after ||
    (classified.noop.find((row) => row.collectionPath === latestRef.path)?.after as
      | ProposedAuthor
      | undefined);
  const chatBackup = captureDocFields(
    loaded.chat.raw || (loaded.chat as unknown as Record<string, unknown>),
    CHAT_SUMMARY_FIELD_KEYS,
  );
  const chatPatch: Record<string, unknown> = {};
  if (summaryAuthor) {
    const wanted = chatSummaryPatchFromAuthor(summaryAuthor);
    const liveSummary = summaryAuthorFieldsFrom(
      loaded.chat.raw || (loaded.chat as unknown as Record<string, unknown>),
    );
    if (
      liveSummary.lastMessageSender !== wanted.lastMessageSender ||
      liveSummary.latestSenderKind !== wanted.latestSenderKind ||
      liveSummary.latestSenderAnonSessionId !== wanted.latestSenderAnonSessionId
    ) {
      Object.assign(chatPatch, wanted);
    }
  }
  const patchChatSummary = Object.keys(chatPatch).length > 0;

  const occ = buildOccSnapshot({
    identities: loaded.identities,
    chatUpdateTime: loaded.chat.updateTime || "",
    repairUpdateTime: "",
    rows: [
      ...appliedRows.map((row) => ({
        messageId: row.messageId,
        updateTime: row.updateTime,
        beforeHash: expectedBeforeHash(row.before),
        kind: "apply" as const,
      })),
      ...classified.noop.map((row) => ({
        messageId: row.messageId,
        updateTime: row.updateTime || "",
        beforeHash: expectedBeforeHash(row.before || row.after || {
          fromUid: "",
          senderAuthUid: "",
          senderProfileId: "",
          senderRole: "",
          senderKind: "",
        }),
        kind: "noop" as const,
      })),
    ],
  });

  const plan: PreparedApplyPlan = {
    repairId,
    operationId,
    previewId,
    previewHash: liveHash,
    chatId,
    reason,
    operatorUid: input.operatorUid,
    operatorEmail: input.operatorEmail,
    identities: loaded.identities,
    occ,
    schemaVersion: HISTORICAL_REPAIR_SCHEMA_VERSION,
    applied: appliedRows,
    noop: classified.noop.map((row) => ({
      messageId: row.messageId,
      updateTime: row.updateTime || "",
      beforeHash: expectedBeforeHash(row.before || {
        fromUid: "",
        senderAuthUid: "",
        senderProfileId: "",
        senderRole: "",
        senderKind: "",
      }),
      collectionName: messageCollectionName(
        row.collectionName ||
          loaded.messages.find((item) => item.id === row.messageId)?.collectionName,
      ),
      collectionPath:
        String(row.collectionPath || "").trim() ||
        messageCollectionPath(
          chatId,
          messageCollectionName(
            row.collectionName ||
              loaded.messages.find((item) => item.id === row.messageId)?.collectionName,
          ),
          row.messageId,
        ),
    })),
    patchChatSummary,
    chatUpdateTime: loaded.chat.updateTime || "",
    chatBackup,
    chatPatch,
    chatAfterPatch: chatPatch,
    plannedLatestMessageId: String(loaded.chat.latestMessageId || ""),
    writeCount: appliedRows.length,
    backupDigest: "",
    consumePreviewId: previewId,
  };
  if (appliedRows.length === 0 && patchChatSummary) {
    return deny("summary_inconsistent");
  }
  const backupJson = JSON.stringify(plan.applied);
  const chatBackupJson = JSON.stringify({
    patched: plan.patchChatSummary,
    fields: plan.chatBackup,
    afterPatch: plan.chatAfterPatch || {},
    latestMessageId: plan.plannedLatestMessageId || "",
    latestCollectionPath: latestRef.path,
    writeCount: plan.writeCount,
  });
  plan.backupDigest = computeBackupDigest({
    writeCount: plan.writeCount,
    backupJson,
    chatBackupJson,
  });

  try {
    await backend.commitApply(plan);
  } catch (error) {
    const message = String((error as Error).message || "commit_failed");
    return deny(message.startsWith("commit_failed") ? "commit_failed" : message, {
      rejected: appliedRows.map((row) => ({
        messageId: row.messageId,
        status: "rejected",
        reason: message.includes("noop_race")
          ? "noop_race"
          : message.includes("does not match") || message.includes("FAILED_PRECONDITION")
            ? "stale_update_time"
            : "commit_failed",
      })),
    });
  }

  return {
    ok: true,
    repairId,
    applied: classified.applied,
    noop: classified.noop,
    rejected: classified.rejected,
    writes: appliedRows.length,
    error: "",
  };
}

export async function runRollbackHistoricalRepair(input: {
  repairId: string;
  operatorUid: string;
  operatorEmail: string;
  reason: string;
  backend: HistoricalRepairBackend;
}): Promise<HistoricalRepairWriteResult> {
  if (!input.backend) return deny("backend_required");

  const repairId = String(input.repairId || "").trim();
  if (!repairId) return deny("repairId_required");
  if (String(input.reason || "").trim().length < 8) return deny("reason_required", { repairId });

  const backend = input.backend;
  const repair = await backend.getRepairById(repairId);
  if (!repair) return deny("repair_not_found", { repairId });
  if (String(repair.status || "") === "rolled_back") {
    return { ok: true, repairId, writes: 0, error: "", applied: [], noop: [], rejected: [] };
  }
  if (String(repair.status || "") !== "applied") {
    return deny("repair_not_applied", { repairId });
  }

  const parsedBackup = parseRepairBackupJson(String(repair.backupJson || ""));
  if (!parsedBackup.ok) return deny(parsedBackup.error, { repairId });
  const integrity = verifyBackupIntegrity({
    writeCount: Number(repair.writeCount ?? parsedBackup.rows.length),
    backupJson: String(repair.backupJson || ""),
    chatBackupJson: String(repair.chatBackupJson || ""),
    digest: String(repair.backupDigest || ""),
    expectedWriteCount: repair.writeCount,
  });
  if (!integrity.ok) return deny(integrity.error, { repairId });
  const backupRows = parsedBackup.rows;

  const schema = validateRepairSchema({
    schemaVersion: Number(repair.schemaVersion),
    writeCount: backupRows.length,
    backupMessageIds: backupRows.map((row) => row.messageId),
  });
  if (!schema.ok) return deny(schema.error, { repairId });

  const chatId = String(repair.chatId || "").trim();
  const loaded = await backend.loadThread(chatId);
  if (loaded.chat.exists === false) return deny("chat_doc_missing", { repairId });
  const classified = classifyRollbackRows({
    backupRows: backupRows as Array<{
      messageId: string;
      before: PersistedAuthor;
      after: ProposedAuthor;
      collectionName?: string;
      collectionPath?: string;
    }>,
    live: loaded.messages,
  });
  if (classified.rejected.length > 0) {
    return deny(classified.rejected[0]?.reason || "rollback_rejected", {
      repairId,
      noop: classified.noop,
      rejected: classified.rejected,
    });
  }

  const parsedChatBackup = parseChatBackupJson(String(repair.chatBackupJson || ""));
  if (!parsedChatBackup.ok) return deny(parsedChatBackup.error, { repairId });
  const chatBackup = parsedChatBackup.parsed.fields || {};
  const restoreChatSummary = Boolean(parsedChatBackup.parsed.patched);
  const chatAfterPatch = parsedChatBackup.parsed.afterPatch || {};
  const plannedLatestMessageId = String(parsedChatBackup.parsed.latestMessageId || "");

  const rollbackNoops = classified.noop.map((row) => ({
    messageId: row.messageId,
    updateTime: row.updateTime || "",
    beforeHash: expectedBeforeHash(row.before || {
      fromUid: "",
      senderAuthUid: "",
      senderProfileId: "",
      senderRole: "",
      senderKind: "",
    }),
  }));

  let plan: PreparedRollbackPlan;
  try {
  plan = {
    repairId,
    chatId,
    identities: loaded.identities,
    repairUpdateTime: repair.updateTime || "",
    chatUpdateTime: loaded.chat.updateTime || "",
    occ: buildOccSnapshot({
      identities: loaded.identities,
      chatUpdateTime: loaded.chat.updateTime || "",
      repairUpdateTime: repair.updateTime || "",
      rows: [
        ...classified.restore.map((row) => ({
          messageId: row.messageId,
          updateTime: row.updateTime || "",
          beforeHash: expectedBeforeHash(row.after || row.before || {
            fromUid: "",
            senderAuthUid: "",
            senderProfileId: "",
            senderRole: "",
            senderKind: "",
          }),
          kind: "apply" as const,
        })),
        ...rollbackNoops.map((row) => ({
          ...row,
          kind: "noop" as const,
        })),
      ],
    }),
    restore: classified.restore.map((row) => {
      const backup = backupRows.find(
        (item) =>
          item.collectionPath === String(row.collectionPath || "") &&
          item.messageId === row.messageId,
      );
      const collectionPath = String(row.collectionPath || backup?.collectionPath || "").trim();
      if (!backup?.fields || !collectionPath) {
        throw new Error("backup_fields_missing");
      }
      return {
        messageId: row.messageId,
        updateTime: row.updateTime || "",
        fields: backup.fields,
        collectionName: messageCollectionName(row.collectionName || backup.collectionName),
        collectionPath,
      };
    }),
    noop: classified.noop.map((row) => {
      const collectionName = messageCollectionName(row.collectionName);
      return {
        messageId: row.messageId,
        updateTime: row.updateTime || "",
        beforeHash: expectedBeforeHash(row.before || {
          fromUid: "",
          senderAuthUid: "",
          senderProfileId: "",
          senderRole: "",
          senderKind: "",
        }),
        collectionName,
        collectionPath:
          String(row.collectionPath || "").trim() ||
          messageCollectionPath(chatId, collectionName, row.messageId),
      };
    }),
    restoreChatSummary,
    chatBackup,
    chatAfterPatch,
    plannedLatestMessageId,
    operatorEmail: input.operatorEmail,
    reason: input.reason,
  };
  } catch (error) {
    return deny(String((error as Error).message || "backup_fields_missing"), { repairId });
  }

  try {
    await backend.commitRollback(plan);
  } catch {
    return deny("commit_failed", {
      repairId,
      noop: classified.noop,
      rejected: classified.restore.map((row) => ({
        ...row,
        status: "rejected",
        reason: "commit_failed",
      })),
    });
  }

  return {
    ok: true,
    repairId,
    writes: classified.restore.length,
    error: "",
    applied: classified.restore,
    noop: classified.noop,
    rejected: classified.rejected,
  };
}
