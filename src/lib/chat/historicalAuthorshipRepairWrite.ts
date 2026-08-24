/**
 * Admin-SDK historical authorship repair writer.
 * APPLY_FROZEN is checked first on apply AND rollback. No runtime bypass.
 * Unfrozen orchestration lives in historicalAuthorshipRepairApplyCore (injected backend only).
 * Does not use the REST API-key commit path. Does not touch 107cae5 persist.
 */
import type { Firestore } from "@/lib/chat/historicalAuthorshipRepairAdmin";
import {
  authorPatchFields,
  evaluateLiveIdentityOcc,
  expectedBeforeHash,
  HISTORICAL_REPAIR_APPLY_FROZEN,
  type ApplySelection,
  type RepairMessageInput,
} from "@/lib/chat/historicalAuthorshipRepair";
import {
  applyFrozenDenial,
  AUTHOR_BACKUP_KEYS,
  CHAT_SUMMARY_FIELD_KEYS,
  rollbackSummaryGate,
  canonicalFirestoreUpdateTime,
  evaluateOccAllOrNone,
  parseMessageCollectionPath,
  restoreDocFields,
  type SealedRepairPreview,
} from "@/lib/chat/historicalRepairSafety";
import {
  buildOccSnapshot,
  runApplyHistoricalRepair,
  runRollbackHistoricalRepair,
  type HistoricalRepairBackend,
  type HistoricalRepairWriteResult,
} from "@/lib/chat/historicalAuthorshipRepairApplyCore";

export {
  buildOccSnapshot,
  keepCanonicalAnonAuthor,
  messageCollectionName,
  type ChatSummarySnapshot,
  type HistoricalRepairBackend,
  type HistoricalRepairWriteResult,
  type PreparedApplyPlan,
  type PreparedRollbackPlan,
  type RepairDocSnapshot,
} from "@/lib/chat/historicalAuthorshipRepairApplyCore";

const DELETE_SENTINEL = { __repairDelete: true } as const;

function messageRefForRow(
  db: Firestore,
  chatId: string,
  row: { messageId: string; collectionPath?: string },
) {
  const path = String(row.collectionPath || "").trim();
  const parsed = parseMessageCollectionPath(path);
  if (!parsed || parsed.chatId !== chatId || parsed.messageId !== row.messageId) {
    throw new Error("backup_path_invalid");
  }
  return db.doc(path);
}

function frozenResult(): HistoricalRepairWriteResult {
  return applyFrozenDenial();
}

async function defaultBackend(): Promise<HistoricalRepairBackend> {
  const { loadRepairThread, loadRepairChatSnapshot, loadRepairMessageDocs } = await import(
    "@/lib/chat/historicalAuthorshipRepairIo"
  );
  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const { loadFirebaseAdminFirestore } = await import("@/lib/admin/firebaseAdminNative");
  const { FieldValue } = loadFirebaseAdminFirestore();

  const materialize = (patch: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      out[key] = value === DELETE_SENTINEL ? FieldValue.delete() : value;
    }
    return out;
  };

  return {
    async getRepairById(repairId) {
      const db = getRepairAdminDb();
      const snap = await db.collection("authorshipRepairs").doc(repairId).get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      return {
        repairId,
        operationId: String(data.operationId || ""),
        status: String(data.status || ""),
        chatId: String(data.chatId || ""),
        updateTime: canonicalFirestoreUpdateTime(snap.updateTime),
        previewHash: String(data.previewHash || ""),
        backupJson: String(data.backupJson || ""),
        chatBackupJson: String(data.chatBackupJson || ""),
        schemaVersion: Number(data.schemaVersion || 0),
        writeCount: Number(data.writeCount || 0),
        backupDigest: String(data.backupDigest || ""),
        applied: Array.isArray(data.applied) ? data.applied : [],
        noop: Array.isArray(data.noop) ? data.noop : [],
      };
    },
    async getPreview(previewId) {
      const db = getRepairAdminDb();
      const snap = await db.collection("authorshipRepairPreviews").doc(previewId).get();
      if (!snap.exists) return null;
      return (snap.data() || null) as SealedRepairPreview | null;
    },
    async loadThread(chatId) {
      const loaded = await loadRepairThread(chatId);
      const chat = await loadRepairChatSnapshot(chatId);
      const messageDocs = await loadRepairMessageDocs(chatId, loaded.messages);
      return { ...loaded, chat, messageDocs };
    },
    async commitApply(plan) {
      const db = getRepairAdminDb();
      await db.runTransaction(async (tx: any) => {
        const chatRef = db.collection("chats").doc(plan.chatId);
        const repairRef = db.collection("authorshipRepairs").doc(plan.repairId);
        const locked = [...plan.applied, ...plan.noop];
        const messageRefs = locked.map((row) => messageRefForRow(db, plan.chatId, row));
        const ownerRef = plan.identities.ownerProfileId
          ? db.collection("usuarios").doc(plan.identities.ownerProfileId)
          : null;
        const usernameQuery = plan.identities.ownerUsernameSlug
          ? db
              .collection("usuarios")
              .where("usernameLower", "==", plan.identities.ownerUsernameSlug)
              .limit(3)
          : null;
        const previewRef = plan.consumePreviewId
          ? db.collection("authorshipRepairPreviews").doc(plan.consumePreviewId)
          : null;
        const [chatSnap, repairSnap, ownerSnap, usernameSnap, previewSnap, ...messageSnaps] =
          (await Promise.all([
            tx.get(chatRef),
            tx.get(repairRef),
            ownerRef ? tx.get(ownerRef) : Promise.resolve(null),
            usernameQuery ? tx.get(usernameQuery) : Promise.resolve(null),
            previewRef ? tx.get(previewRef) : Promise.resolve(null),
            ...messageRefs.map((ref) => tx.get(ref)),
          ])) as any[];
        if (previewRef) {
          if (!previewSnap?.exists) {
            throw new Error("preview_missing");
          }
          if (previewSnap.data()?.consumed === true) throw new Error("preview_consumed");
        }
        const ownerLookupUid =
          usernameSnap?.docs && usernameSnap.size === 1
            ? usernameSnap.docs[0].id
            : "";

        const liveIdentity = evaluateLiveIdentityOcc({
          chatId: plan.chatId,
          chatData: (chatSnap.data() || {}) as Record<string, unknown>,
          chatExists: chatSnap.exists,
          ownerProfile: ownerSnap?.exists
            ? {
                id: ownerSnap.id,
                username: String(ownerSnap.data()?.username || ""),
                usernameLower: String(ownerSnap.data()?.usernameLower || ""),
              }
            : null,
          ownerLookupUid,
          expected: plan.identities,
        });
        if (!liveIdentity.ok) throw new Error(liveIdentity.error);

        const liveMessages = messageSnaps.map((snap, index) => {
          const row = [...plan.applied, ...plan.noop][index];
          const data = (snap.data() || {}) as Record<string, unknown>;
          return {
            messageId: row.messageId,
            updateTime: canonicalFirestoreUpdateTime(snap.updateTime),
            beforeHash: expectedBeforeHash({
              fromUid: String(data.fromUid || data.ownerId || data.senderUid || ""),
              senderAuthUid: String(data.senderAuthUid || ""),
              senderProfileId: String(data.senderProfileId || data.profileUid || ""),
              senderRole: String(data.senderRole || ""),
              senderKind: String(data.senderKind || ""),
            }),
            kind: index < plan.applied.length ? ("apply" as const) : ("noop" as const),
          };
        });
        const liveOcc = buildOccSnapshot({
          identities: {
            ...plan.identities,
            ownerIdSource: liveIdentity.ok ? plan.identities.ownerIdSource : "ambiguous_mismatch",
          },
          chatUpdateTime: canonicalFirestoreUpdateTime(chatSnap.updateTime),
          repairUpdateTime: canonicalFirestoreUpdateTime(repairSnap.updateTime),
          rows: liveMessages,
        });
        const occ = evaluateOccAllOrNone(plan.occ, liveOcc);
        if (!occ.ok) throw new Error(occ.error);

        tx.create(repairRef, {
          repairId: plan.repairId,
          operationId: plan.operationId,
          previewId: plan.previewId,
          previewHash: plan.previewHash,
          chatId: plan.chatId,
          operatorUid: plan.operatorUid,
          operatorEmail: plan.operatorEmail,
          createdAt: new Date().toISOString(),
          reason: plan.reason,
          status: "applied",
          schemaVersion: plan.schemaVersion,
          ownerIdSource: plan.identities.ownerIdSource,
          threadAnonPresent: plan.identities.threadAnonId ? "1" : "0",
          writeCount: plan.writeCount,
          backupDigest: plan.backupDigest,
          applied: plan.applied.map((row) => ({
            messageId: row.messageId,
            status: "applied",
            reason: "ready",
          })),
          noop: plan.noop.map((row) => ({
            messageId: row.messageId,
            status: "noop",
            reason: "already_canonical",
          })),
          backupJson: JSON.stringify(plan.applied),
          chatBackupJson: JSON.stringify({
            patched: plan.patchChatSummary,
            fields: plan.chatBackup,
            afterPatch: plan.chatAfterPatch || {},
            latestMessageId: plan.plannedLatestMessageId || "",
            writeCount: plan.writeCount,
            backupDigest: plan.backupDigest,
          }),
        });
        if (previewRef) {
          tx.update(previewRef, { consumed: true, consumedBy: plan.repairId });
        }

        tx.create(db.collection("admin_logs").doc(`log_${plan.repairId}`), {
          timestamp: new Date().toISOString(),
          adminEmail: plan.operatorEmail,
          action: "authorship_repair_apply",
          targetId: plan.repairId,
          metadata: JSON.stringify({
            repairId: plan.repairId,
            writes: plan.applied.length,
            error: "",
          }),
        });

        for (const row of plan.applied) {
          tx.update(messageRefForRow(db, plan.chatId, row), materialize(authorPatchFields(row.after)));
        }

        if (plan.patchChatSummary) {
          tx.update(chatRef, materialize(plan.chatPatch));
        }
      });
    },
    async commitRollback(plan) {
      const db = getRepairAdminDb();
      await db.runTransaction(async (tx: any) => {
        const chatRef = db.collection("chats").doc(plan.chatId);
        const repairRef = db.collection("authorshipRepairs").doc(plan.repairId);
        const locked = [...plan.restore, ...plan.noop];
        const messageRefs = locked.map((row) => messageRefForRow(db, plan.chatId, row));
        const ownerRef = plan.identities.ownerProfileId
          ? db.collection("usuarios").doc(plan.identities.ownerProfileId)
          : null;
        const usernameQuery = plan.identities.ownerUsernameSlug
          ? db
              .collection("usuarios")
              .where("usernameLower", "==", plan.identities.ownerUsernameSlug)
              .limit(3)
          : null;
        const [chatSnap, repairSnap, ownerSnap, usernameSnap, ...messageSnaps] =
          (await Promise.all([
            tx.get(chatRef),
            tx.get(repairRef),
            ownerRef ? tx.get(ownerRef) : Promise.resolve(null),
            usernameQuery ? tx.get(usernameQuery) : Promise.resolve(null),
            ...messageRefs.map((ref) => tx.get(ref)),
          ])) as any[];
        if (String(repairSnap.data()?.status || "") !== "applied") {
          throw new Error("repair_not_applied");
        }
        const ownerLookupUid =
          usernameSnap?.docs && usernameSnap.size === 1
            ? usernameSnap.docs[0].id
            : "";
        const liveIdentity = evaluateLiveIdentityOcc({
          chatId: plan.chatId,
          chatData: (chatSnap.data() || {}) as Record<string, unknown>,
          chatExists: chatSnap.exists,
          ownerProfile: ownerSnap?.exists
            ? {
                id: ownerSnap.id,
                username: String(ownerSnap.data()?.username || ""),
                usernameLower: String(ownerSnap.data()?.usernameLower || ""),
              }
            : null,
          ownerLookupUid,
          expected: plan.identities,
        });
        if (!liveIdentity.ok) throw new Error(liveIdentity.error);
        const chatData = (chatSnap.data() || {}) as Record<string, unknown>;
        const summaryGate = rollbackSummaryGate({
          liveLatestMessageId: String(chatData.latestMessageId || ""),
          plannedLatestMessageId: plan.plannedLatestMessageId || "",
          liveSummary: chatData,
          afterPatch: plan.chatAfterPatch || {},
        });
        if (plan.restoreChatSummary && !summaryGate.ok) throw new Error(summaryGate.error);
        const liveOcc = buildOccSnapshot({
          identities: plan.identities,
          chatUpdateTime: canonicalFirestoreUpdateTime(chatSnap.updateTime),
          repairUpdateTime: canonicalFirestoreUpdateTime(repairSnap.updateTime),
          rows: messageSnaps.map((snap, index) => {
            const row = locked[index];
            const data = (snap.data() || {}) as Record<string, unknown>;
            return {
              messageId: row.messageId,
              updateTime: canonicalFirestoreUpdateTime(snap.updateTime),
              beforeHash: expectedBeforeHash({
                fromUid: String(data.fromUid || data.ownerId || data.senderUid || ""),
                senderAuthUid: String(data.senderAuthUid || ""),
                senderProfileId: String(data.senderProfileId || data.profileUid || ""),
                senderRole: String(data.senderRole || ""),
                senderKind: String(data.senderKind || ""),
              }),
              kind: index < plan.restore.length ? ("apply" as const) : ("noop" as const),
            };
          }),
        });
        const occ = evaluateOccAllOrNone(plan.occ, liveOcc);
        if (!occ.ok) throw new Error(occ.error);
        for (const row of plan.restore) {
          const snap = messageSnaps.find((item) => item.id === row.messageId);
          if (!snap?.exists) throw new Error("message_missing");
          const restored: Record<string, unknown> = {};
          restoreDocFields(restored, row.fields, DELETE_SENTINEL, AUTHOR_BACKUP_KEYS);
          tx.update(messageRefForRow(db, plan.chatId, row), materialize(restored));
        }
        if (plan.restoreChatSummary) {
          const restoredChat: Record<string, unknown> = {};
          restoreDocFields(restoredChat, plan.chatBackup, DELETE_SENTINEL, CHAT_SUMMARY_FIELD_KEYS);
          tx.update(chatRef, materialize(restoredChat));
        }
        tx.update(repairRef, {
          status: "rolled_back",
          rolledBackAt: new Date().toISOString(),
          rolledBackBy: plan.operatorEmail,
          rollbackReason: plan.reason,
        });
        tx.create(db.collection("admin_logs").doc(`log_${plan.repairId}_rb`), {
          timestamp: new Date().toISOString(),
          adminEmail: plan.operatorEmail,
          action: "authorship_repair_rollback",
          targetId: plan.repairId,
          metadata: JSON.stringify({
            repairId: plan.repairId,
            writes: plan.restore.length,
            error: "",
          }),
        });
      });
    },
  };
}

export async function applyHistoricalAuthorshipRepair(input: {
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
  backend?: HistoricalRepairBackend;
}): Promise<HistoricalRepairWriteResult> {
  if (HISTORICAL_REPAIR_APPLY_FROZEN) return frozenResult();
  const backend = input.backend || (await defaultBackend());
  return runApplyHistoricalRepair({ ...input, backend });
}

export async function rollbackHistoricalAuthorshipRepair(input: {
  repairId: string;
  operatorUid: string;
  operatorEmail: string;
  reason: string;
  backend?: HistoricalRepairBackend;
}): Promise<HistoricalRepairWriteResult> {
  if (HISTORICAL_REPAIR_APPLY_FROZEN) return frozenResult();
  const backend = input.backend || (await defaultBackend());
  return runRollbackHistoricalRepair({ ...input, backend });
}

export type { RepairMessageInput };
