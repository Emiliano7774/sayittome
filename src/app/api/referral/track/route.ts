import { NextResponse } from "next/server";

import { trackReferralSignup } from "@/lib/boost/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const inviteeUid = String(body?.inviteeUid || body?.uid || "").trim();
    const referralCode = String(body?.referralCode || body?.ref || "").trim();
    const inviteeEmail = String(body?.inviteeEmail || body?.email || "").trim();
    const visitorId = String(body?.visitorId || "").trim();

    const result = await trackReferralSignup({
      inviteeUid,
      referralCode,
      inviteeEmail,
      visitorId,
    });

    return NextResponse.json({ ...result, ts: Date.now() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
