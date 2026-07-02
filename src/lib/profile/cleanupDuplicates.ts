import { writeAdminLog } from "@/lib/admin/adminLogs";
import { runCollectionQueryAll } from "@/lib/firestore/rest";
import { deleteOrphanProfile } from "@/lib/profile/cleanupOrphans";
import { isPublicProfile } from "@/lib/profile/isPublicProfile";
import {
  buildShuffleDedupeProfileFromFirestoreUser,
  shuffleProfileDedupeKeys,
} from "@/lib/shuffle/dedupeProfiles";

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

function resolveDocId(user: Record<string, unknown>) {
  return String(user.id || user.uid || "").trim();
}

export async function listDuplicateProfileGroups() {
  const users = await runCollectionQueryAll(
    "usuarios",
    "usernameLower",
    "ASCENDING",
    500,
    40,
  );

  const usersByDocId = new Map<string, Record<string, unknown>>();
  const parent = new Map<string, string>();
  const keyToDocId = new Map<string, string>();

  for (const user of users) {
    const docId = resolveDocId(user);
    if (!docId) continue;
    usersByDocId.set(docId, user);
    parent.set(docId, docId);
  }

  function find(docId: string): string {
    const current = parent.get(docId) || docId;
    if (current === docId) return docId;
    const root = find(current);
    parent.set(docId, root);
    return root;
  }

  function union(a: string, b: string) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  }

  for (const user of users) {
    const docId = resolveDocId(user);
    if (!docId) continue;

    const keys = shuffleProfileDedupeKeys(buildShuffleDedupeProfileFromFirestoreUser(user));
    for (const key of keys) {
      const existingDocId = keyToDocId.get(key);
      if (existingDocId) {
        union(docId, existingDocId);
      } else {
        keyToDocId.set(key, docId);
      }
    }
  }

  const grouped = new Map<string, Record<string, unknown>[]>();

  for (const docId of usersByDocId.keys()) {
    const root = find(docId);
    const rows = grouped.get(root) || [];
    rows.push(usersByDocId.get(docId)!);
    grouped.set(root, rows);
  }

  const groups: DuplicateProfileGroup[] = [];

  for (const rows of grouped.values()) {
    if (rows.length < 2) continue;

    const sorted = [...rows].sort((a, b) => profileRank(b) - profileRank(a));
    const keepUid = resolveDocId(sorted[0]);
    const removeUids = sorted
      .slice(1)
      .map((row) => resolveDocId(row))
      .filter((uid) => uid && uid !== keepUid);

    if (!keepUid || removeUids.length === 0) continue;

    groups.push({
      usernameLower: String(sorted[0].usernameLower || sorted[0].username || "").toLowerCase(),
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
  const removed = new Set<string>();

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
      if (removed.has(uid)) continue;
      removed.add(uid);
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
