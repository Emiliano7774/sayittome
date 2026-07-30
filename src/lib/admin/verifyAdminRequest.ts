import { ADMIN_EMAIL, isAdminEmail } from "@/lib/admin/isAdmin";
import { FIRESTORE_API_KEY } from "@/lib/firestore/rest";

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
      throw Object.assign(new Error("invalid_admin_token"), { status: 401 });
    }
    const payload = (await response.json()) as {
      users?: Array<{ email?: string; localId?: string; disabled?: boolean }>;
    };
    const user = payload.users?.[0];
    if (!user || user.disabled === true) {
      throw Object.assign(new Error("invalid_admin_token"), { status: 401 });
    }
    const email = String(user.email || "").trim().toLowerCase();
    if (!isAdminEmail(email) || email !== ADMIN_EMAIL) {
      throw Object.assign(new Error("forbidden"), { status: 403 });
    }
    return { email, uid: String(user.localId || "") };
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 0);
    if (status === 403) throw error;
    throw Object.assign(new Error("invalid_admin_token"), { status: 401 });
  }
}
