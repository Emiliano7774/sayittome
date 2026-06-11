import { NextResponse } from "next/server";

import { assertAdminEmail, getAdminEmailFromRequest } from "@/lib/admin/isAdmin";
import {
  cleanupDuplicateProfiles,
  listDuplicateProfileGroups,
} from "@/lib/profile/cleanupDuplicates";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const adminEmail = getAdminEmailFromRequest(req);
    assertAdminEmail(adminEmail);

    const groups = await listDuplicateProfileGroups();
    const duplicateCount = groups.reduce(
      (sum, group) => sum + group.removeUids.length,
      0,
    );

    return NextResponse.json({
      ok: true,
      groupCount: groups.length,
      duplicateCount,
      groups,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    const status = message === "forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const adminEmail = getAdminEmailFromRequest(req);
    assertAdminEmail(adminEmail);

    const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
    const result = await cleanupDuplicateProfiles(adminEmail, {
      dryRun: body?.dryRun === true,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    const status = message === "forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
