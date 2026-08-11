import { NextResponse } from "next/server";

import { verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";
import { rollbackHistoricalAuthorshipRepair } from "@/lib/chat/historicalAuthorshipRepairWrite";

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

  const body = (await req.json()) as { repairId?: string; reason?: string };
  const result = await rollbackHistoricalAuthorshipRepair({
    repairId: String(body.repairId || ""),
    reason: String(body.reason || ""),
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
  }, { status: result.ok ? 200 : 409 });
}
