import { NextResponse } from "next/server";

import { assertAdminEmail, getAdminEmailFromRequest } from "@/lib/admin/isAdmin";
import {
  runCollectionQuery,
  runCollectionQueryAllByDocumentId,
} from "@/lib/firestore/rest";
import { isLiveByConnection, ONLINE_WINDOW_MS } from "@/lib/presence";

export const dynamic = "force-dynamic";

const ANON_ACTIVE_MS = 2 * 60 * 1000;

type AdminDocumentSnapshot = {
  id: string;
  data: () => Record<string, unknown>;
  createTime?: { toDate?: () => Date };
};

function isAnonActive(doc: Record<string, unknown>, now: number) {
  const expiresAt = String(doc.expiresAt || "");
  if (expiresAt) {
    const expiresDate = new Date(expiresAt);
    if (!Number.isNaN(expiresDate.getTime())) return expiresDate.getTime() > now;
  }

  const lastSeenAt = String(doc.lastSeenAt || doc.updatedAt || "");
  if (!lastSeenAt) return false;

  const seenDate = new Date(lastSeenAt);
  if (Number.isNaN(seenDate.getTime())) return false;

  return now - seenDate.getTime() <= ANON_ACTIVE_MS;
}

export async function GET(req: Request) {
  try {
    const adminEmail = getAdminEmailFromRequest(req);
    assertAdminEmail(adminEmail);

    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    let adminDb: ReturnType<
      (typeof import("@/lib/chat/historicalAuthorshipRepairAdmin"))["getRepairAdminDb"]
    > | null = null;

    try {
      const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
      adminDb = getRepairAdminDb();
    } catch (error) {
      if ((error as Error)?.message !== "admin_sdk_unavailable") throw error;
    }

    const readAdminCollection = async (name: string, limit?: number) => {
      if (!adminDb) return null;
      let query = adminDb.collection(name);
      if (limit) query = query.limit(limit);
      const snap = await query.get();
      return snap.docs.map((doc: AdminDocumentSnapshot) => ({
        ...doc.data(),
        id: doc.id,
        _firestoreCreateTime: doc.createTime?.toDate?.()?.toISOString?.() || "",
      })) as Record<string, unknown>[];
    };

    const adminCollections = adminDb
      ? await Promise.all([
          readAdminCollection("usuarios"),
          readAdminCollection("historias", 500),
          readAdminCollection("chats", 500),
          readAdminCollection("reportes", 200),
          readAdminCollection("anonimos_activos", 250),
          readAdminCollection("admin_logs", 120),
        ])
      : null;

    const safeFallbackQuery = async (
      load: () => Promise<Record<string, unknown>[]>,
    ) => {
      try {
        return await load();
      } catch {
        return [];
      }
    };

    const [users, stories, chats, reports, anonDocs, logs] = adminCollections
      ? (adminCollections as Record<string, unknown>[][])
      : await Promise.all([
          runCollectionQueryAllByDocumentId("usuarios"),
          safeFallbackQuery(() => runCollectionQuery("historias", 500, "createdAt")),
          safeFallbackQuery(() => runCollectionQuery("chats", 500, "updatedAt")),
          safeFallbackQuery(() => runCollectionQuery("reportes", 200, "createdAt")),
          safeFallbackQuery(() => runCollectionQuery("anonimos_activos", 250)),
          safeFallbackQuery(() => runCollectionQuery("admin_logs", 120, "timestamp")),
        ]);

    const usersTotal = new Set(
      users
        .map((user) => String(user.uid || user.id || "").trim())
        .filter(Boolean),
    ).size;

    const usersOnline = users.filter((user) =>
      isLiveByConnection(
        String(user.lastActiveAt || user.lastSeenAt || user.lastActive || ""),
        ONLINE_WINDOW_MS,
        now,
      ),
    ).length;

    const storiesActive = stories.filter((story) => {
      if (story.adminDeleted === true || story.active === false) return false;
      const expiresAt = String(story.expiresAt || "");
      if (!expiresAt) return true;
      const expiresDate = new Date(expiresAt);
      return !Number.isNaN(expiresDate.getTime()) && expiresDate.getTime() > now;
    }).length;

    const chatsActive = chats.filter((chat) => {
      const updatedAt = new Date(String(chat.updatedAt || chat.createdAt || ""));
      return !Number.isNaN(updatedAt.getTime()) && updatedAt.getTime() > dayAgo;
    }).length;

    const messagesLast24h = chats.filter((chat) => {
      const updatedAt = new Date(String(chat.updatedAt || ""));
      return !Number.isNaN(updatedAt.getTime()) && updatedAt.getTime() > dayAgo;
    }).length;

    const openReports = reports.filter(
      (report) => String(report.estado || "pendiente") !== "descartado",
    ).length;

    const blurProfiles = users.filter(
      (user) =>
        user.adminBlurProfilePhoto === true ||
        user.adminBlurFotosPerfil === true ||
        user.adminBlurStories === true ||
        user.adminBlurGallery === true,
    ).length;

    const bannedUsers = users.filter(
      (user) => user.banned === true || user.suspendido === true,
    ).length;

    const abuseBlocks = users.filter((user) => user.abuseProtectionEnabled === true).length;

    const growthToday = users.filter((user) => {
      const createdAt = new Date(String(user.createdAt || ""));
      return !Number.isNaN(createdAt.getTime()) && createdAt.getTime() > dayAgo;
    }).length;

    return NextResponse.json({
      ok: true,
      stats: {
        usersTotal,
        usersOnline,
        anonymousOnline: anonDocs.filter((doc) => isAnonActive(doc, now)).length,
        storiesActive,
        chatsActive,
        messagesLast24h,
        reportsOpen: openReports,
        reportsTotal: reports.length,
        blurProfiles,
        bannedUsers,
        abuseBlocksEnabled: abuseBlocks,
        storageUsedMb: Math.round((stories.length * 2.4 + users.length * 0.35) * 10) / 10,
        growthToday,
        adminLogsRecent: logs.length,
      },
      ts: now,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    const status = message === "forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
