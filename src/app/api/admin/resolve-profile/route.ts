import { NextResponse } from "next/server";

import { verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";
import { getFirestoreDoc } from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

/**
 * Server-resolved profile link for admin UI.
 * Anon Auth without usuarios profile → no invented link.
 */
export async function GET(req: Request) {
  try {
    await verifyAdminIdToken(req);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return privateJson(
      { ok: false, error: String((error as Error)?.message || "unauthorized") },
      status,
    );
  }

  const uid = String(new URL(req.url).searchParams.get("uid") || "").trim();
  if (!uid) {
    return privateJson({ ok: false, error: "missing_uid" }, 400);
  }

  try {
    const doc = await getFirestoreDoc("usuarios", uid);
    if (!doc) {
      return privateJson({
        ok: true,
        uid,
        hasProfile: false,
        username: "",
        link: null,
        reason: "no_usuarios_doc",
      });
    }
    const username = String(doc.username || doc.usernameLower || "").trim();
    if (!username) {
      return privateJson({
        ok: true,
        uid,
        hasProfile: false,
        username: "",
        link: null,
        reason: "no_username",
      });
    }
    return privateJson({
      ok: true,
      uid,
      hasProfile: true,
      username,
      link: `/u/${encodeURIComponent(username)}`,
    });
  } catch (error) {
    return privateJson(
      { ok: false, error: String((error as Error)?.message || "resolve_failed") },
      500,
    );
  }
}
