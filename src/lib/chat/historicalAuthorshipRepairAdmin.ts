/**
 * Server-only Admin SDK accessor for historical authorship repair writes.
 * Callers MUST check HISTORICAL_REPAIR_APPLY_FROZEN before invoking this.
 *
 * Loads firebase-admin only via firebaseAdminNative (opaque require) so Turbopack
 * cannot emit firebase-admin-<hash> externals that break GCF Linux SSR.
 *
 * TODO: wire Next API Admin credentials (FIREBASE_SERVICE_ACCOUNT_JSON or
 * GOOGLE_APPLICATION_CREDENTIALS). Until then getRepairAdminDb() fails closed
 * when ADC/SA are missing. APPLY_FROZEN denies apply/rollback before this
 * module is reached for writes.
 */
import {
  loadFirebaseAdminApp,
  loadFirebaseAdminFirestore,
} from "@/lib/admin/firebaseAdminNative";

/** Opaque Admin Firestore handle — methods resolved at runtime via native SDK. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Firestore = any;

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

  const { applicationDefault, cert, getApps, initializeApp } = loadFirebaseAdminApp();
  const { getFirestore } = loadFirebaseAdminFirestore();

  if (getApps().length === 0) {
    const serviceAccount = parseServiceAccount();
    const hasAdc = Boolean(
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT,
    );
    try {
      if (serviceAccount?.client_email && serviceAccount.private_key) {
        const projectId = resolveAdminProjectId(serviceAccount.project_id);
        initializeApp({
          credential: cert(serviceAccount),
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
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 0);
      if (status === 503) throw error;
      // ADC can look present (GCLOUD_PROJECT) while credentials are unusable on Hosting.
      throw Object.assign(new Error("admin_sdk_unavailable"), { status: 503 });
    }
  } else {
    const existing = getApps()[0]?.options?.projectId;
    if (existing) assertRepairAdminProjectId(String(existing));
  }

  try {
    cachedDb = getFirestore() as Firestore;
    return cachedDb;
  } catch {
    throw Object.assign(new Error("admin_sdk_unavailable"), { status: 503 });
  }
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
