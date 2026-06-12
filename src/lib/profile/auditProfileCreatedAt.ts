import { writeAdminLog } from "@/lib/admin/adminLogs";
import { patchFirestoreDoc, runCollectionQueryAll } from "@/lib/firestore/rest";
import { isPublicProfile } from "@/lib/profile/isPublicProfile";
import {
  resolveProfileCreatedAt,
  resolveProfileCreatedAtIso,
} from "@/lib/profile/resolveProfileCreatedAt";

export type ProfileCreatedAtAuditRow = {
  uid: string;
  username: string;
  currentCreatedAt: string;
  trueCreatedAt: string;
  firestoreCreateTime: string;
  needsPatch: boolean;
};

function parseFieldCreatedAt(user: Record<string, unknown>) {
  const raw = user.createdAt;
  if (!raw) return "";
  return String(raw);
}

export async function auditProfileCreatedAt(options: { dryRun?: boolean } = {}) {
  const users = await runCollectionQueryAll("usuarios", "createdAt", "DESCENDING", 500, 40);
  const rows: ProfileCreatedAtAuditRow[] = [];
  const patched: string[] = [];

  for (const user of users) {
    const uid = String(user.uid || user.id || "").trim();
    if (!uid) continue;

    const trueCreatedAt = resolveProfileCreatedAtIso(user);
    if (!trueCreatedAt) continue;

    const currentCreatedAt = parseFieldCreatedAt(user);
    const currentMs = new Date(currentCreatedAt).getTime();
    const trueMs = new Date(trueCreatedAt).getTime();
    const needsPatch =
      !currentCreatedAt ||
      Number.isNaN(currentMs) ||
      Math.abs(currentMs - trueMs) > 60_000;

    rows.push({
      uid,
      username: String(user.username || user.usernameLower || user.nombre || ""),
      currentCreatedAt,
      trueCreatedAt,
      firestoreCreateTime: String(user._firestoreCreateTime || ""),
      needsPatch,
    });

    if (!needsPatch || options.dryRun) continue;

    await patchFirestoreDoc("usuarios", uid, {
      createdAt: trueCreatedAt,
      originalCreatedAt: String(user.originalCreatedAt || trueCreatedAt),
    });
    patched.push(uid);
  }

  return {
    dryRun: options.dryRun === true,
    scanned: users.length,
    publicProfiles: users.filter((user) => isPublicProfile(user)).length,
    datedProfiles: rows.length,
    needsPatch: rows.filter((row) => row.needsPatch).length,
    patchedCount: patched.length,
    patched,
    rows: rows.filter((row) => row.needsPatch).slice(0, 100),
  };
}

export async function runProfileCreatedAtAudit(
  adminEmail: string,
  options: { dryRun?: boolean } = {},
) {
  const result = await auditProfileCreatedAt(options);

  if (!options.dryRun) {
    await writeAdminLog({
      adminEmail,
      action: "audit_profile_created_at",
      metadata: {
        scanned: result.scanned,
        needsPatch: result.needsPatch,
        patchedCount: result.patchedCount,
      },
    });
  }

  return result;
}
