/**
 * Server-only Admin SDK accessor for historical authorship repair writes.
 * Callers MUST check HISTORICAL_REPAIR_APPLY_FROZEN before invoking this.
 *
 * TODO: wire Next API Admin credentials (FIREBASE_SERVICE_ACCOUNT_JSON or
 * GOOGLE_APPLICATION_CREDENTIALS). Until then getRepairAdminDb() fails closed.
 * APPLY_FROZEN denies apply/rollback before this module is reached.
 */
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export { evaluateLiveIdentityOcc } from "@/lib/chat/historicalAuthorshipRepair";

let cachedDb: Firestore | null = null;

function parseServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  } catch {
    return null;
  }
}

const EXPECTED_PROJECT_ID = "sayittome-app";

export function assertRepairAdminProjectId(projectId: string) {
  if (String(projectId || "").trim() !== EXPECTED_PROJECT_ID) {
    throw Object.assign(new Error("admin_project_mismatch"), { status: 503 });
  }
}

function resolveAdminProjectId(explicit?: string) {
  const projectId = String(
    explicit ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.FIREBASE_PROJECT_ID ||
      "",
  ).trim();
  assertRepairAdminProjectId(projectId || EXPECTED_PROJECT_ID);
  return projectId || EXPECTED_PROJECT_ID;
}

export function getRepairAdminDb(): Firestore {
  if (cachedDb) return cachedDb;

  if (getApps().length === 0) {
    const serviceAccount = parseServiceAccount();
    const hasAdc = Boolean(
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT,
    );
    if (serviceAccount?.client_email && serviceAccount.private_key) {
      const projectId = resolveAdminProjectId(serviceAccount.project_id);
      initializeApp({
        credential: cert(serviceAccount as ServiceAccount),
        projectId,
      });
    } else if (hasAdc) {
      const projectId = resolveAdminProjectId();
      initializeApp({
        credential: applicationDefault(),
        projectId,
      });
    } else {
      throw Object.assign(new Error("admin_sdk_unavailable"), { status: 503 });
    }
  } else {
    const existing = getApps()[0]?.options?.projectId;
    if (existing) assertRepairAdminProjectId(String(existing));
  }

  cachedDb = getFirestore();
  return cachedDb;
}

export async function lookupUniqueProfileUidByUsernameAdmin(username: string) {
  const slug = String(username || "").trim().toLowerCase();
  if (!slug) return { ok: false as const, uid: "", error: "username_required" };
  const db = getRepairAdminDb();
  const snap = await db
    .collection("usuarios")
    .where("usernameLower", "==", slug)
    .limit(3)
    .get();
  if (snap.empty) return { ok: false as const, uid: "", error: "username_not_found" };
  if (snap.size > 1) return { ok: false as const, uid: "", error: "username_not_unique" };
  return { ok: true as const, uid: snap.docs[0].id, error: "" };
}
