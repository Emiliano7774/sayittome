import { NextResponse } from "next/server";

import { assertAdminEmail, getAdminEmailFromRequest } from "@/lib/admin/isAdmin";
import { isLiveByConnection, ONLINE_WINDOW_MS } from "@/lib/presence";
import { runCollectionQuery } from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const adminEmail = getAdminEmailFromRequest(req);
    assertAdminEmail(adminEmail);

    const now = Date.now();
    const users = await runCollectionQuery("usuarios", 500);
    const stories = await runCollectionQuery("historias", 500);

    const storiesByOwner = new Map<string, number>();

    for (const story of stories) {
      if (story.adminDeleted === true || story.active === false) continue;
      const owner = String(story.ownerUid || story.uid || "");
      if (!owner) continue;
      storiesByOwner.set(owner, (storiesByOwner.get(owner) || 0) + 1);
    }

    const rows = users
      .map((user) => {
        const uid = String(user.uid || user.id || "");
        const heartbeat = String(
          user.lastActiveAt || user.lastSeenAt || user.lastActive || "",
        );

        return {
          uid,
          username: String(user.username || user.usernameLower || "usuario"),
          email: String(user.email || ""),
          photo: String(user.fotoPrincipal || user.photoURL || ""),
          provincia: String(user.provincia || ""),
          online: isLiveByConnection(heartbeat, ONLINE_WINDOW_MS, now),
          lastActive: heartbeat,
          blur:
            user.adminBlurProfilePhoto === true ||
            user.adminBlurFotosPerfil === true,
          banned: user.banned === true || user.suspendido === true,
          shadowban: user.shadowban === true,
          moderationTag: String(user.moderationTag || ""),
          activeStories: storiesByOwner.get(uid) || 0,
          abuseProtectionEnabled: user.abuseProtectionEnabled === true,
        };
      })
      .sort((a, b) => String(b.lastActive).localeCompare(String(a.lastActive)));

    return NextResponse.json({ ok: true, users: rows, ts: now });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    const status = message === "forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
