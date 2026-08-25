import { writeAdminLog } from "@/lib/admin/adminLogs";
import {
  deleteFirestoreDoc,
  patchFirestoreDoc,
  runCollectionQuery,
} from "@/lib/firestore/rest";
import { deleteUsuarioPrivileged } from "@/lib/firestore/patchUsuarioPrivileged";
import {
  describeProfileValidationIssues,
  getProfileValidationIssues,
  isPublicProfile,
} from "@/lib/profile/isPublicProfile";

export type OrphanProfileRow = {
  uid: string;
  username: string;
  email: string;
  issues: string;
};

export async function listOrphanProfiles(limit = 500) {
  const users = await runCollectionQuery("usuarios", limit);

  return users
    .filter((user) => !isPublicProfile(user))
    .map((user) => ({
      uid: String(user.uid || user.id || ""),
      username: String(user.username || user.usernameLower || user.nombre || ""),
      email: String(user.email || ""),
      issues: describeProfileValidationIssues(getProfileValidationIssues(user)),
    }))
    .filter((row) => row.uid);
}

async function disableStoriesForUid(uid: string) {
  const stories = await runCollectionQuery("historias", 500);
  let count = 0;

  for (const story of stories) {
    const owner = String(story.ownerUid || story.uid || "");
    if (owner !== uid) continue;

    await patchFirestoreDoc("historias", String(story.id), {
      active: false,
      adminDeleted: true,
      adminDisabled: true,
    });
    count += 1;
  }

  return count;
}

async function deleteFollowEdgesForUid(uid: string) {
  const follows = await runCollectionQuery("seguidores", 500);
  let count = 0;

  for (const row of follows) {
    const seguidorUid = String(row.seguidorUid || "");
    const seguidoUid = String(row.seguidoUid || "");
    if (seguidorUid !== uid && seguidoUid !== uid) continue;

    await deleteFirestoreDoc("seguidores", String(row.id));
    count += 1;
  }

  return count;
}

export async function deleteOrphanProfile(
  uid: string,
  adminEmail: string,
  opts?: { idToken?: string },
) {
  const stories = await disableStoriesForUid(uid);
  const follows = await deleteFollowEdgesForUid(uid);

  await deleteUsuarioPrivileged(uid, { idToken: opts?.idToken });

  await writeAdminLog({
    adminEmail,
    action: "delete_orphan_user",
    targetUid: uid,
    metadata: { stories, follows },
  });

  return { stories, follows };
}

export async function cleanupOrphanProfiles(
  adminEmail: string,
  options: { dryRun?: boolean; limit?: number; idToken?: string } = {},
) {
  const orphans = await listOrphanProfiles(options.limit ?? 500);

  if (options.dryRun) {
    return {
      dryRun: true,
      count: orphans.length,
      orphans,
      deleted: [] as OrphanProfileRow[],
    };
  }

  const deleted: OrphanProfileRow[] = [];

  for (const orphan of orphans) {
    await deleteOrphanProfile(orphan.uid, adminEmail, { idToken: options.idToken });
    deleted.push(orphan);
  }

  await writeAdminLog({
    adminEmail,
    action: "cleanup_orphan_profiles",
    metadata: { count: deleted.length },
  });

  return {
    dryRun: false,
    count: orphans.length,
    orphans,
    deleted,
  };
}
