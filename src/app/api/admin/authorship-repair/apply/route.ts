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
  };

  const chatId = String(body.chatId || "").trim();
  const selections: ApplySelection[] = (body.selections || [])
    .map((row) => {
      if (row?.desiredRole !== "profile" && row?.desiredRole !== "anon") return null;
      return {
        messageId: String(row.messageId || ""),
        desiredRole: row.desiredRole,
        expectedBeforeHash: String(row.expectedBeforeHash || ""),
        updateTime: String(row.updateTime || ""),
      };
    })
    .filter((row): row is ApplySelection => Boolean(row?.messageId));

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
  });

  return NextResponse.json({
    ok: result.ok,
    repairId: result.repairId,
    writes: result.writes,
    error: result.error,
    applied: result.applied.map((row) => ({ messageId: row.messageId, status: row.status, reason: row.reason })),
    noop: result.noop.map((row) => ({ messageId: row.messageId, status: row.status, reason: row.reason })),
    rejected: result.rejected.map((row) => ({ messageId: row.messageId, status: row.status, reason: row.reason })),
  }, { status: result.ok ? 200 : result.error === "reason_required" || result.error === "confirm_write_count_mismatch" ? 400 : 409 });
}
