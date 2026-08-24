import { ADMIN_EMAIL, isAdminEmail } from "@/lib/admin/isAdmin";
import { FIRESTORE_API_KEY } from "@/lib/firestore/rest";

export type VerifiedFirebaseUser = {
  email: string;
  uid: string;
};

export type VerifiedAdmin = VerifiedFirebaseUser;

export function adminAuthFromHeaders(input: {
  authorization?: string | null;
  xAdminEmail?: string | null;
}): { ok: true; token: string } | { ok: false; status: 401; error: "unauthorized" } {
  void input.xAdminEmail;
  const match = String(input.authorization || "").match(/^Bearer\s+(.+)$/i);
  const token = String(match?.[1] || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true, token };
}

export function readBearerToken(req: Request): string {
  const parsed = adminAuthFromHeaders({
    authorization: req.headers.get("authorization") || req.headers.get("Authorization"),
    xAdminEmail: req.headers.get("x-admin-email"),
  });
  if (!parsed.ok) {
    throw Object.assign(new Error(parsed.error), { status: parsed.status });
  }
  return parsed.token;
}

export function mapAdminAuthFailure(error: unknown): { status: number; error: string } {
  const status = Number((error as { status?: number })?.status || 401);
  if (status === 403) return { status: 403, error: "forbidden" };
  if (status === 503) return { status: 503, error: "unavailable" };
  return { status: 401, error: "unauthorized" };
}

export function assertAdminAllowlist(email: string) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!isAdminEmail(normalized) || normalized !== ADMIN_EMAIL) {
    throw Object.assign(new Error("forbidden"), { status: 403 });
  }
}

async function verifyIdTokenWithAdminSdk(token: string): Promise<VerifiedFirebaseUser> {
  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const { loadFirebaseAdminAuth } = await import("@/lib/admin/firebaseAdminNative");
  getRepairAdminDb();
  const { getAuth } = loadFirebaseAdminAuth();
  // checkRevoked=true — non-negotiable
  const decoded = await getAuth().verifyIdToken(token, true);
  if (decoded.email_verified !== true) {
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  }
  return {
    email: String(decoded.email || "").trim().toLowerCase(),
    uid: String(decoded.uid || ""),
  };
}

async function verifyIdTokenViaIdentityToolkit(token: string): Promise<VerifiedFirebaseUser> {
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
  return {
    email: String(user.email || "").trim().toLowerCase(),
    uid: String(user.localId || ""),
  };
}

/**
 * Requires Authorization: Bearer <Firebase ID token> and resolves the Firebase
 * user without trusting a UID or email supplied by the client.
 * Admin SDK first (revoke check); Identity Toolkit only on infra/503.
 */
export async function verifyFirebaseIdToken(req: Request): Promise<VerifiedFirebaseUser> {
  const token = readBearerToken(req);

  try {
    return await verifyIdTokenWithAdminSdk(token);
  } catch (adminError) {
    const adminStatus = Number((adminError as { status?: number })?.status || 0);
    if (adminStatus === 401 || adminStatus === 403) throw adminError;
  }

  try {
    return await verifyIdTokenViaIdentityToolkit(token);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 0);
    if (status === 403) throw error;
    throw Object.assign(new Error("invalid_auth_token"), { status: 401 });
  }
}

/**
 * Admin reads/writes: Bearer Firebase ID token.
 * Prefer Admin SDK with verifyIdToken(token, true) revoke check.
 * Fall back to Identity Toolkit only when Admin SDK is unavailable (503/infra).
 * Allowlist is always enforced. Never trusts x-admin-email.
 */
export async function verifyAdminIdToken(req: Request): Promise<VerifiedAdmin> {
  const token = readBearerToken(req);
  let verified: VerifiedFirebaseUser | null = null;
  let adminSdkError: unknown = null;

  try {
    verified = await verifyIdTokenWithAdminSdk(token);
  } catch (error) {
    adminSdkError = error;
    const status = Number((error as { status?: number })?.status || 0);
    // Hard auth failures stay hard; only infrastructure outages may fall back.
    if (status === 401 || status === 403) {
      const mapped = mapAdminAuthFailure(error);
      throw Object.assign(new Error(mapped.error), { status: mapped.status });
    }
  }

  if (!verified) {
    try {
      verified = await verifyIdTokenViaIdentityToolkit(token);
    } catch {
      const mapped = mapAdminAuthFailure(adminSdkError || new Error("unauthorized"));
      throw Object.assign(new Error(mapped.error), { status: mapped.status });
    }
  }

  assertAdminAllowlist(verified.email);
  return verified;
}
