import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { ADMIN_EMAIL, isAdminEmail } from "@/lib/admin/isAdmin";

let adminInitAttempted = false;

function ensureAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  if (adminInitAttempted) return null;
  adminInitAttempted = true;
  try {
    return initializeApp({
      credential: applicationDefault(),
      projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "sayittome-app",
    });
  } catch (error) {
    console.error("firebase-admin init failed", error);
    return null;
  }
}

export type VerifiedAdmin = {
  email: string;
  uid: string;
};

/**
 * Requires Authorization: Bearer <Firebase ID token> whose email is the
 * hard-coded admin allowlist. Rejects spoofable x-admin-email / body email alone.
 */
export async function verifyAdminIdToken(req: Request): Promise<VerifiedAdmin> {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = String(match?.[1] || "").trim();
  if (!token) {
    throw Object.assign(new Error("missing_admin_token"), { status: 401 });
  }

  const app = ensureAdminApp();
  if (!app) {
    throw Object.assign(new Error("admin_auth_unavailable"), { status: 503 });
  }

  try {
    const decoded = await getAuth(app).verifyIdToken(token, true);
    const email = String(decoded.email || "").trim().toLowerCase();
    if (!isAdminEmail(email) || email !== ADMIN_EMAIL) {
      throw Object.assign(new Error("forbidden"), { status: 403 });
    }
    return { email, uid: String(decoded.uid || "") };
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 0);
    if (status === 403) throw error;
    throw Object.assign(new Error("invalid_admin_token"), { status: 401 });
  }
}
