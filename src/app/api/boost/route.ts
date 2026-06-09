import { NextResponse } from "next/server";

import { activateBoost, getBoostStatus } from "@/lib/boost/service";

export const dynamic = "force-dynamic";

function siteOrigin(req: Request) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  return "https://sayittome-app.web.app";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = String(searchParams.get("uid") || "").trim();
    if (!uid) {
      return NextResponse.json({ ok: false, error: "missing_uid" }, { status: 400 });
    }

    const status = await getBoostStatus(uid, siteOrigin(req));
    if (!status) {
      return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ...status, ts: Date.now() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || "").trim();
    if (!uid) {
      return NextResponse.json({ ok: false, error: "missing_uid" }, { status: 400 });
    }

    const result = await activateBoost(uid);
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason, ts: Date.now() }, { status: 200 });
    }

    return NextResponse.json({ ...result, ts: Date.now() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
