import { ADMIN_EMAIL, isAdminEmail } from "@/lib/admin/isAdmin";
import { FIRESTORE_API_KEY } from "@/lib/firestore/rest";

export type VerifiedFirebaseUser = {
  email: string;
  uid: string;
};

export type VerifiedAdmin = VerifiedFirebaseUser;

/**
 * Requires Authorization: Bearer <Firebase ID token> and resolves the Firebase
 * user without trusting a UID or email supplied by the client.
 */
export async function verifyFirebaseIdToken(req: Request): Promise<VerifiedFirebaseUser> {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = String(match?.[1] || "").trim();
  if (!token) {
    throw Object.assign(new Error("missing_auth_token"), { status: 401 });
  }

  try {
    const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
    const { getAuth } = await import("firebase-admin/auth");
    getRepairAdminDb();
    const decoded = await getAuth().verifyIdToken(token, true);
    if (decoded.email_verified !== true) {
      throw Object.assign(new Error("email_not_verified"), { status: 401 });
    }
    const email = String(decoded.email || "").trim().toLowerCase();
    return { email, uid: String(decoded.uid || "") };
  } catch (adminError) {
    const adminStatus = Number((adminError as { status?: number })?.status || 0);
    if (adminStatus === 401 || adminStatus === 403) throw adminError;
    // Fall back to Identity Toolkit lookup when Admin SDK is unavailable.
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIRESTORE_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw Object.assign(new Error("invalid_auth_token"), { status: 401 });
    }
    const payload = (await response.json()) as {
      users?: Array<{
        email?: string;
        localId?: string;
        disabled?: boolean;
        emailVerified?: boolean;
        validSince?: string;
      }>;
    };
    const user = payload.users?.[0];
    if (!user || user.disabled === true || user.emailVerified !== true) {
      throw Object.assign(new Error("invalid_auth_token"), { status: 401 });
    }
    const email = String(user.email || "").trim().toLowerCase();
    return { email, uid: String(user.localId || "") };
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 0);
    if (status === 403) throw error;
    throw Object.assign(new Error("invalid_auth_token"), { status: 401 });
  }
}

/**
 * Requires a verified Firebase user whose email is in the hard-coded admin
 * allowlist. Rejects spoofable x-admin-email / body email alone.
 */
export async function verifyAdminIdToken(req: Request): Promise<VerifiedAdmin> {
  const verified = await verifyFirebaseIdToken(req);
  if (!isAdminEmail(verified.email) || verified.email !== ADMIN_EMAIL) {
    throw Object.assign(new Error("forbidden"), { status: 403 });
  }
  return verified;
}
