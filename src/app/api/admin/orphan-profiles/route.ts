import { NextResponse } from "next/server";

import { assertAdminEmail, getAdminEmailFromRequest } from "@/lib/admin/isAdmin";
import { cleanupOrphanProfiles, listOrphanProfiles } from "@/lib/profile/cleanupOrphans";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const adminEmail = getAdminEmailFromRequest(req);
    assertAdminEmail(adminEmail);

    const orphans = await listOrphanProfiles(500);

    return NextResponse.json({ ok: true, count: orphans.length, orphans });
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
    const result = await cleanupOrphanProfiles(adminEmail, {
      dryRun: body?.dryRun === true,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    const status = message === "forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
