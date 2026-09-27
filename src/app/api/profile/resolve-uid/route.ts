import { NextResponse } from "next/server";

import { getRepairAdminDb } from "@/lib/chat/historicalAuthorshipRepairAdmin";
import { isPublicProfile } from "@/lib/profile/isPublicProfile";
import { isValidUsername, normalizeUsername } from "@/lib/profile/username";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function currentUsername(data: Record<string, unknown>) {
  for (const value of [data.username, data.usernameLower, data.nombre]) {
    const username = normalizeUsername(String(value || ""));
    if (username && isValidUsername(username)) return username;
  }
  return "";
}

/** Resolve the current public username from the immutable Firebase uid. */
export async function GET(req: Request) {
  const uid = String(new URL(req.url).searchParams.get("uid") || "").trim();
  if (!uid || uid.length > 128 || uid.startsWith("anon_")) {
    return response({ ok: false, username: "", reason: "invalid_uid" }, 400);
  }

  try {
    const snapshot = await getRepairAdminDb().collection("usuarios").doc(uid).get();
    if (!snapshot.exists) {
      return response({ ok: false, username: "", reason: "profile_not_found" }, 404);
    }

    const data = (snapshot.data() || {}) as Record<string, unknown>;
    if (!isPublicProfile(data)) {
      return response({ ok: false, username: "", reason: "profile_not_public" }, 404);
    }

    const username = currentUsername(data);
    if (!username) {
      return response({ ok: false, username: "", reason: "username_missing" }, 404);
    }

    return response({ ok: true, username });
  } catch (error) {
    console.error("profile_resolve_uid", error);
    return response({ ok: false, username: "", reason: "resolve_failed" }, 500);
  }
}
