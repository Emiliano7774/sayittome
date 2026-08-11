import { NextResponse } from "next/server";

import { verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";
import {
  HISTORICAL_REPAIR_FREEZE_REASON,
  assertHistoricalRepairApplyAllowed,
} from "@/lib/chat/historicalAuthorshipRepair";

export const dynamic = "force-dynamic";

/** Checkpoint: rollback writer also frozen. No Firestore writes. */
export async function POST(req: Request) {
  try {
    await verifyAdminIdToken(req);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return NextResponse.json(
      { ok: false, error: String((error as Error)?.message || "forbidden") },
      { status },
    );
  }

  try {
    assertHistoricalRepairApplyAllowed();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        rolledBack: false,
        writes: 0,
        error: HISTORICAL_REPAIR_FREEZE_REASON,
      },
      { status: 423 },
    );
  }

  return NextResponse.json(
    { ok: false, rolledBack: false, writes: 0, error: "rollback_not_implemented" },
    { status: 501 },
  );
}
