import { writeAdminLog } from "@/lib/admin/adminLogs";
import { runCollectionQueryAll } from "@/lib/firestore/rest";
import { deleteOrphanProfile } from "@/lib/profile/cleanupOrphans";
import { isPublicProfile } from "@/lib/profile/isPublicProfile";

export type DuplicateProfileRow = {
  uid: string;
  docId: string;
  username: string;
  email: string;
  lastActiveAt: string;
  score: number;
};

export type DuplicateProfileGroup = {
  usernameLower: string;
  keepUid: string;
  removeUids: string[];
  profiles: DuplicateProfileRow[];
};

function profileRank(user: Record<string, unknown>) {
  const docId = String(user.id || "");
  const uid = String(user.uid || docId);
  let score = 0;

  if (docId && uid && docId === uid) score += 1000;
  if (user.profileSetupComplete === true) score += 200;
  if (isPublicProfile(user)) score += 100;

  const photos = Array.isArray(user.fotos) ? user.fotos.length : 0;
  score += Math.min(photos, 10) * 10;

  if (user.fotoPrincipal || user.photoURL) score += 30;

  const active = String(
    user.lastActiveAt || user.lastSeenAt || user.updatedAt || user.createdAt || "",
  );
  const ms = new Date(active).getTime();
  if (!Number.isNaN(ms)) score += ms / 1e10;

  return score;
}

function toDuplicateRow(user: Record<string, unknown>): DuplicateProfileRow {
  const docId = String(user.id || "");
  const uid = String(user.uid || docId);
  const username = String(user.username || user.usernameLower || user.nombre || "");

  return {
    uid,
    docId,
    username,
    email: String(user.email || ""),
    lastActiveAt: String(
      user.lastActiveAt || user.lastSeenAt || user.updatedAt || user.createdAt || "",
    ),
    score: profileRank(user),
  };
}

export async function listDuplicateProfileGroups() {
  const users = await runCollectionQueryAll("usuarios", "createdAt", "DESCENDING", 500, 20);
  const byUsername = new Map<string, Record<string, unknown>[]>();

  for (const user of users) {
    const usernameLower = String(user.usernameLower || user.username || "")
      .trim()
      .toLowerCase();

    if (!usernameLower || usernameLower === "usuario") continue;

    const group = byUsername.get(usernameLower) || [];
    group.push(user);
    byUsername.set(usernameLower, group);
  }

  const groups: DuplicateProfileGroup[] = [];

  for (const [usernameLower, rows] of byUsername) {
    if (rows.length < 2) continue;

    const sorted = [...rows].sort((a, b) => profileRank(b) - profileRank(a));
    const keepUid = String(sorted[0].id || sorted[0].uid || "");
    const removeUids = sorted
      .slice(1)
      .map((row) => String(row.id || row.uid || ""))
      .filter((uid) => uid && uid !== keepUid);

    if (!keepUid || removeUids.length === 0) continue;

    groups.push({
      usernameLower,
      keepUid,
      removeUids,
      profiles: sorted.map(toDuplicateRow),
    });
  }

  return groups;
}

export async function cleanupDuplicateProfiles(
  adminEmail: string,
  options: { dryRun?: boolean } = {},
) {
  const groups = await listDuplicateProfileGroups();
  const deleted: Array<{ usernameLower: string; uid: string }> = [];

  if (options.dryRun) {
    return {
      dryRun: true,
      groupCount: groups.length,
      duplicateCount: groups.reduce((sum, group) => sum + group.removeUids.length, 0),
      groups,
      deleted,
    };
  }

  for (const group of groups) {
    for (const uid of group.removeUids) {
      await deleteOrphanProfile(uid, adminEmail);
      deleted.push({ usernameLower: group.usernameLower, uid });
    }
  }

  await writeAdminLog({
    adminEmail,
    action: "cleanup_duplicate_profiles",
    metadata: {
      groupCount: groups.length,
      deletedCount: deleted.length,
    },
  });

  return {
    dryRun: false,
    groupCount: groups.length,
    duplicateCount: deleted.length,
    groups,
    deleted,
  };
}
