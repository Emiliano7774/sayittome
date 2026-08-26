import { NextResponse } from "next/server";

import { verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";
import { fetchAllModerationChatsForUser } from "@/lib/moderation/fetchUserChats";
import {
  HISTORICAL_REPAIR_APPLY_FROZEN,
  buildRepairPlan,
  markFromPerspective,
  type OperatorMark,
  type RepairPerspective,
} from "@/lib/chat/historicalAuthorshipRepair";
import {
  loadRepairChatSnapshot,
  loadRepairThread,
} from "@/lib/chat/historicalAuthorshipRepairIo";
import {
  classifyInventoryConfidence,
  exportRepairPlanOpaque,
  hashReviewedPreviewPlan,
  inventoryBucketOnly,
  operationIdForApply,
  previewIdForHash,
  sealReviewedPreview,
} from "@/lib/chat/historicalRepairSafety";

export const dynamic = "force-dynamic";

function jsonError(error: unknown) {
  const status = Number((error as { status?: number })?.status || 500);
  return NextResponse.json(
    { ok: false, error: String((error as Error)?.message || "error") },
    { status: status === 401 || status === 403 ? status : 500 },
  );
}

export async function GET(req: Request) {
  try {
    await verifyAdminIdToken(req);
    const url = new URL(req.url);
    const username = String(url.searchParams.get("username") || "").trim();
    if (!username) {
      return NextResponse.json({ ok: false, error: "username required" }, { status: 400 });
    }
    const result = await fetchAllModerationChatsForUser(username);
    const buckets = { high: 0, medium: 0, low: 0, ambiguous: 0 };
    for (const chat of result.chats) {
      const row = chat as Record<string, unknown>;
      const bucket = classifyInventoryConfidence({
        identityOk: Boolean(row.id),
        missingSenderRole: 0,
        alreadyCanonical: 0,
        messageCount: 0,
      });
      buckets[bucket] += 1;
    }
    return NextResponse.json({
      ok: true,
      uidPresent: Boolean(result.uid),
      inventory: inventoryBucketOnly(buckets),
      chats: result.chats.map((chat) => {
        const row = chat as Record<string, unknown>;
        return {
          id: String(row.id || ""),
          lastMessage: String(row.lastMessage || "").slice(0, 80),
        };
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await verifyAdminIdToken(req);
    const body = (await req.json()) as {
      chatId?: string;
      perspective?: RepairPerspective;
      marks?: Array<{
        messageId?: string;
        mine?: boolean;
        authorRole?: string;
        selectedAnonId?: string;
        collectionPath?: string;
      }>;
      redactPii?: boolean;
    };
    const chatId = String(body.chatId || "").trim();
    if (!chatId) {
      return NextResponse.json({ ok: false, error: "chatId required" }, { status: 400 });
    }

    const rawMarks = body.marks || [];
    if (
      rawMarks.some(
        (mark) =>
          !String(mark.messageId || "").trim() ||
          (mark.authorRole !== "profile" &&
            mark.authorRole !== "anon" &&
            typeof mark.mine !== "boolean"),
      )
    ) {
      return NextResponse.json(
        { ok: false, error: "mixed_invalid_request", writes: 0 },
        { status: 409 },
      );
    }

    const loaded = await loadRepairThread(chatId);
    const chat = await loadRepairChatSnapshot(chatId);
    const perspective: RepairPerspective =
      body.perspective === "visitor" ? "visitor" : "owner";
    const marks: OperatorMark[] = rawMarks.map((mark) => {
      const extras = {
        selectedAnonId: mark.selectedAnonId,
        collectionPath: mark.collectionPath,
      };
      if (mark.authorRole === "profile" || mark.authorRole === "anon") {
        return {
          messageId: String(mark.messageId || ""),
          authorRole: mark.authorRole,
          source: "operator" as const,
          ...extras,
        };
      }
      return markFromPerspective(perspective, String(mark.messageId || ""), Boolean(mark.mine), extras);
    });

    const plan = buildRepairPlan({
      identities: loaded.identities,
      messages: loaded.messages,
      marks,
      includeText: body.redactPii !== true,
      chat,
    });
    if (plan.errorCount > 0 && marks.length > 0 && plan.rows.some((row) => row.selected && row.error)) {
      return NextResponse.json(
        { ok: false, error: "mixed_invalid_request", writes: 0, plan },
        { status: 409 },
      );
    }

    const selections = plan.rows
      .filter((row) => row.selected && row.proposed)
      .map((row) => {
        const mark = marks.find(
          (entry) =>
            (entry.collectionPath && entry.collectionPath === row.collectionPath) ||
            entry.messageId === row.messageId,
        );
        return {
          messageId: row.messageId,
          desiredRole: row.proposed!.senderRole,
          expectedBeforeHash: row.expectedBeforeHash,
          updateTime: row.updateTime,
          collectionName: row.collectionName,
          collectionPath: row.collectionPath || "",
          selectedAnonId:
            mark?.selectedAnonId || loaded.identities.threadAnonId,
          markSource: "operator" as const,
          before: row.persisted,
          after: row.proposed || undefined,
        };
      });
    // Refuse to seal inferred/proposed-only plans — apply unfreeze requires operator marks.
    if (selections.length > 0 && marks.length === 0) {
      return NextResponse.json(
        { ok: false, error: "selection_unmarked", writes: 0, plan },
        { status: 409 },
      );
    }
    const previewHash = hashReviewedPreviewPlan({
      chatId,
      writeCount: plan.writeCount,
      selections,
    });
    const previewId = previewIdForHash(previewHash);
    const sealedPreview = sealReviewedPreview({
      previewId,
      previewHash,
      chatId,
      selections,
      actorUid: admin.uid,
      identities: loaded.identities,
      chatUpdateTime: chat.updateTime,
      latestMessageId: chat.latestMessageId,
      latestCollectionPath: chat.latestCollectionPath,
    });
    const operationId = operationIdForApply({
      chatId,
      reason: "preview",
      requestStatus: "preview",
      previewId,
      previewHash,
      operatorUid: admin.uid,
      identity: loaded.identities,
      selections,
    });

    // Persist sealed preview even while APPLY_FROZEN so unfreeze→apply can OCC-consume it.
    // This writes authorshipRepairPreviews only — never message roles.
    const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
    await getRepairAdminDb().collection("authorshipRepairPreviews").doc(previewId).set({
      ...sealedPreview,
      consumed: false,
      applyFrozenAtSeal: HISTORICAL_REPAIR_APPLY_FROZEN,
    });

    return NextResponse.json({
      ok: true,
      applyAllowed: plan.applyAllowed && sealedPreview.composition === "operator_marks_only",
      applyFrozen: HISTORICAL_REPAIR_APPLY_FROZEN,
      operatorMarksOnlyUnfreeze:
        HISTORICAL_REPAIR_APPLY_FROZEN &&
        sealedPreview.composition === "operator_marks_only",
      chatBlocked: plan.chatBlocked,
      blockReason: plan.blockReason,
      perspective,
      previewId,
      previewHash,
      operationId,
      sealedPreview,
      plan: body.redactPii ? exportRepairPlanOpaque(plan) : plan,
    });
  } catch (error) {
    return jsonError(error);
  }
}
