import { NextResponse } from "next/server";

import { verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";
import { type ApplySelection } from "@/lib/chat/historicalAuthorshipRepair";
import { applyHistoricalAuthorshipRepair } from "@/lib/chat/historicalAuthorshipRepairWrite";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let operator;
  try {
    operator = await verifyAdminIdToken(req);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return NextResponse.json(
      { ok: false, error: String((error as Error)?.message || "forbidden"), writes: 0 },
      { status },
    );
  }

  const body = (await req.json()) as {
    chatId?: string;
    reason?: string;
    confirmWriteCount?: number;
    selections?: ApplySelection[];
    previewId?: string;
    previewHash?: string;
    operationId?: string;
    sealedPreview?: import("@/lib/chat/historicalRepairSafety").SealedRepairPreview;
  };

  const chatId = String(body.chatId || "").trim();
  const rawSelections = Array.isArray(body.selections) ? body.selections : [];
  const mixed = rawSelections.some((row) => {
    if (!row || typeof row !== "object") return true;
    if (row.desiredRole !== "profile" && row.desiredRole !== "anon") return true;
    if (!String(row.messageId || "").trim()) return true;
    return false;
  });

  if (mixed) {
    return NextResponse.json(
      {
        ok: false,
        error: "mixed_invalid_request",
        writes: 0,
        applied: [],
        noop: [],
        rejected: rawSelections.map((row) => ({
          messageId: String(row?.messageId || ""),
          status: "rejected",
          reason: "mixed_invalid_request",
        })),
      },
      { status: 409 },
    );
  }

  const selections: ApplySelection[] = rawSelections.map((row) => ({
    messageId: String(row.messageId || ""),
    desiredRole: row.desiredRole,
    expectedBeforeHash: String(row.expectedBeforeHash || ""),
    updateTime: String(row.updateTime || ""),
    collectionName: row.collectionName,
    collectionPath: row.collectionPath,
    selectedAnonId: row.selectedAnonId,
  }));

  if (!chatId || selections.length === 0) {
    return NextResponse.json(
      { ok: false, error: "chatId_and_selections_required", writes: 0, applied: [], noop: [], rejected: [] },
      { status: 400 },
    );
  }

  const result = await applyHistoricalAuthorshipRepair({
    chatId,
    selections,
    reason: String(body.reason || ""),
    confirmWriteCount: Number(body.confirmWriteCount),
    operatorUid: operator.uid,
    operatorEmail: operator.email,
    previewId: String(body.previewId || ""),
    previewHash: String(body.previewHash || ""),
    operationId: String(body.operationId || ""),
    sealedPreview: body.sealedPreview,
  });

  const status = result.ok
    ? 200
    : result.error === "reason_required" || result.error === "confirm_write_count_mismatch"
      ? 400
      : result.error === "apply_frozen" || result.status === 403
        ? 403
        : 409;

  return NextResponse.json({
    ok: result.ok,
    repairId: result.repairId,
    writes: result.writes,
    error: result.error,
    applied: result.applied.map((row) => ({ messageId: row.messageId, status: row.status, reason: row.reason })),
    noop: result.noop.map((row) => ({ messageId: row.messageId, status: row.status, reason: row.reason })),
    rejected: result.rejected.map((row) => ({ messageId: row.messageId, status: row.status, reason: row.reason })),
  }, { status });
}
