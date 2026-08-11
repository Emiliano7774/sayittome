import { writeAdminLog } from "@/lib/admin/adminLogs";
import {
  FIRESTORE_API_KEY,
  FIRESTORE_PROJECT_ID,
  getFirestoreDoc,
  toFirestoreFields,
} from "@/lib/firestore/rest";
import {
  authorPatchFields,
  classifyApplySelections,
  classifyRollbackRows,
  type ApplySelection,
  type PersistedAuthor,
  type ProposedAuthor,
  type RepairMessageInput,
  type ThreadIdentities,
} from "@/lib/chat/historicalAuthorshipRepair";
import { loadRepairThread } from "@/lib/chat/historicalAuthorshipRepairIo";

const AUTHOR_FIELD_PATHS = [
  "fromUid",
  "ownerId",
  "senderAuthUid",
  "senderProfileId",
  "senderRole",
  "senderKind",
  "profileUid",
];

function messageDocName(chatId: string, messageId: string) {
  return `projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/chats/${encodeURIComponent(chatId)}/mensajes/${encodeURIComponent(messageId)}`;
}

function repairDocName(repairId: string) {
  return `projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/authorshipRepairs/${encodeURIComponent(repairId)}`;
}

async function commitWrites(writes: unknown[]) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:commit?key=${encodeURIComponent(FIRESTORE_API_KEY)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ writes }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = String((json as { error?: { message?: string } })?.error?.message || res.status);
    throw new Error(`commit_failed:${message}`);
  }
  return json;
}

function authorUpdateWrite(
  chatId: string,
  messageId: string,
  author: ProposedAuthor | PersistedAuthor,
  updateTime?: string,
) {
  return {
    update: {
      name: messageDocName(chatId, messageId),
      fields: toFirestoreFields(authorPatchFields(author)),
    },
    updateMask: { fieldPaths: AUTHOR_FIELD_PATHS },
    currentDocument: updateTime ? { updateTime } : { exists: true },
  };
}

export async function applyHistoricalAuthorshipRepair(input: {
  chatId: string;
  selections: ApplySelection[];
  reason: string;
  confirmWriteCount: number;
  operatorUid: string;
  operatorEmail: string;
}) {
  const loaded = await loadRepairThread(input.chatId);
  const classified = classifyApplySelections({
    identities: loaded.identities,
    live: loaded.messages,
    selections: input.selections,
    confirmWriteCount: input.confirmWriteCount,
    reason: input.reason,
  });

  if (classified.blocked) {
    return {
      ok: false,
      repairId: "",
      applied: classified.applied,
      noop: classified.noop,
      rejected: classified.rejected,
      writes: 0,
      error: classified.blockReason,
    };
  }

  if (classified.applied.length === 0) {
    return {
      ok: true,
      repairId: "",
      applied: [],
      noop: classified.noop,
      rejected: classified.rejected,
      writes: 0,
      error: "",
    };
  }

  const repairId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  const backupRows = classified.applied.map((row) => ({
    messageId: row.messageId,
    before: row.before,
    after: row.after,
    updateTime: row.updateTime || "",
  }));

  const writes = [
    {
      update: {
        name: repairDocName(repairId),
        fields: toFirestoreFields({
          repairId,
          chatId: input.chatId,
          operatorUid: input.operatorUid,
          operatorEmail: input.operatorEmail,
          createdAt,
          reason: input.reason,
          status: "applied",
          ownerIdSource: loaded.identities.ownerIdSource,
          threadAnonPresent: loaded.identities.threadAnonId ? "1" : "0",
          backupJson: JSON.stringify(backupRows),
        }),
      },
      currentDocument: { exists: false },
    },
    ...classified.applied.map((row) =>
      authorUpdateWrite(input.chatId, row.messageId, row.after as ProposedAuthor, row.updateTime),
    ),
  ];

  try {
    await commitWrites(writes);
  } catch (error) {
    const reason = String((error as Error).message || "commit_failed");
    return {
      ok: false,
      repairId: "",
      applied: [],
      noop: classified.noop,
      rejected: [
        ...classified.rejected,
        ...classified.applied.map((row) => ({
          ...row,
          status: "rejected" as const,
          reason: reason.includes("does not match") || reason.includes("FAILED_PRECONDITION")
            ? "stale_update_time"
            : "commit_failed",
        })),
      ],
      writes: 0,
      error: reason.startsWith("commit_failed") ? "commit_failed" : reason,
    };
  }

  try {
    await writeAdminLog({
      adminEmail: input.operatorEmail,
      action: "authorship_repair_apply",
      targetId: repairId,
      metadata: {
        repairId,
        chatIdSuffix: input.chatId.slice(-8),
        writes: classified.applied.length,
        noop: classified.noop.length,
        rejected: classified.rejected.length,
      },
    });
  } catch {
    // audit log is best-effort after durable commit
  }

  return {
    ok: true,
    repairId,
    applied: classified.applied,
    noop: classified.noop,
    rejected: classified.rejected,
    writes: classified.applied.length,
    error: "",
  };
}

export async function rollbackHistoricalAuthorshipRepair(input: {
  repairId: string;
  operatorUid: string;
  operatorEmail: string;
  reason: string;
}) {
  const repairId = String(input.repairId || "").trim();
  if (!repairId) {
    return { ok: false, repairId: "", writes: 0, error: "repairId_required", applied: [], noop: [], rejected: [] };
  }
  if (String(input.reason || "").trim().length < 8) {
    return { ok: false, repairId, writes: 0, error: "reason_required", applied: [], noop: [], rejected: [] };
  }

  const repair = await getFirestoreDoc("authorshipRepairs", repairId);
  if (!repair) {
    return { ok: false, repairId, writes: 0, error: "repair_not_found", applied: [], noop: [], rejected: [] };
  }
  if (String(repair.status || "") === "rolled_back") {
    return { ok: true, repairId, writes: 0, error: "", applied: [], noop: [], rejected: [] };
  }
  if (String(repair.status || "") !== "applied") {
    return { ok: false, repairId, writes: 0, error: "repair_not_applied", applied: [], noop: [], rejected: [] };
  }

  const chatId = String(repair.chatId || "").trim();
  let backupRows: Array<{ messageId: string; before: PersistedAuthor; after: ProposedAuthor }> = [];
  try {
    backupRows = JSON.parse(String(repair.backupJson || "[]"));
  } catch {
    return { ok: false, repairId, writes: 0, error: "backup_corrupt", applied: [], noop: [], rejected: [] };
  }

  const loaded = await loadRepairThread(chatId);
  const classified = classifyRollbackRows({ backupRows, live: loaded.messages });
  if (classified.rejected.length > 0) {
    return {
      ok: false,
      repairId,
      writes: 0,
      error: classified.rejected[0]?.reason || "rollback_rejected",
      applied: [],
      noop: classified.noop,
      rejected: classified.rejected,
    };
  }

  const writes = [
    ...classified.restore.map((row) =>
      authorUpdateWrite(chatId, row.messageId, row.before as PersistedAuthor, row.updateTime),
    ),
    {
      update: {
        name: repairDocName(repairId),
        fields: toFirestoreFields({
          status: "rolled_back",
          rolledBackAt: new Date().toISOString(),
          rolledBackBy: input.operatorEmail,
          rollbackReason: input.reason,
        }),
      },
      updateMask: { fieldPaths: ["status", "rolledBackAt", "rolledBackBy", "rollbackReason"] },
      currentDocument: { exists: true },
    },
  ];

  try {
    await commitWrites(writes);
  } catch (error) {
    return {
      ok: false,
      repairId,
      writes: 0,
      error: "commit_failed",
      applied: [],
      noop: classified.noop,
      rejected: [
        ...classified.rejected,
        ...classified.restore.map((row) => ({
          ...row,
          status: "rejected" as const,
          reason: "commit_failed",
        })),
      ],
    };
  }

  try {
    await writeAdminLog({
      adminEmail: input.operatorEmail,
      action: "authorship_repair_rollback",
      targetId: repairId,
      metadata: {
        repairId,
        writes: classified.restore.length,
        operatorUid: input.operatorUid,
      },
    });
  } catch {
    // best-effort
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

export type { ThreadIdentities, RepairMessageInput };
