/**
 * Server-only Admin SDK accessor for historical authorship repair writes.
 * Callers MUST check HISTORICAL_REPAIR_APPLY_FROZEN before invoking this.
 *
 * Loads firebase-admin only via firebaseAdminNative (opaque require) so Turbopack
 * cannot emit firebase-admin-<hash> externals that break GCF Linux SSR.
 *
 * DEFAULT app resolution is shared with P0 diag via ensureDefaultAdminApp() so
 * named-only firebase-frameworks registries cannot leave Admin SDK without DEFAULT app.
 */
import {
  ensureDefaultAdminApp,
  readDefaultAdminProjectId,
} from "@/lib/admin/firebaseAdminDefaultApp";
import { loadFirebaseAdminFirestore } from "@/lib/admin/firebaseAdminNative";

/** Opaque Admin Firestore handle — methods resolved at runtime via native SDK. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Firestore = any;

export { evaluateLiveIdentityOcc } from "@/lib/chat/historicalAuthorshipRepair";

let cachedDb: Firestore | null = null;

const EXPECTED_PROJECT_ID = "sayittome-app";

export function assertRepairAdminProjectId(projectId: string) {
  if (String(projectId || "").trim() !== EXPECTED_PROJECT_ID) {
    throw Object.assign(new Error("admin_project_mismatch"), { status: 503 });
  }
}

export function getRepairAdminDb(): Firestore {
  if (cachedDb) return cachedDb;

  const app = ensureDefaultAdminApp();
  assertRepairAdminProjectId(readDefaultAdminProjectId(app));

  const { getFirestore } = loadFirebaseAdminFirestore();
  try {
    cachedDb = getFirestore(app) as Firestore;
    return cachedDb;
  } catch {
    throw Object.assign(new Error("admin_sdk_unavailable"), { status: 503 });
  }
}

/** Harness-only: paired with resetDefaultAdminAppCacheForHarness after deleteApp(). */
export function resetRepairAdminDbCacheForHarness() {
  cachedDb = null;
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
