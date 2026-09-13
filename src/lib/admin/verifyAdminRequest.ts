import { ADMIN_EMAIL, isAdminEmail } from "@/lib/admin/isAdmin";
import { FIRESTORE_API_KEY } from "@/lib/firestore/rest";

export type VerifiedFirebaseUser = {
  email: string;
  uid: string;
};

export type VerifiedFirebasePrincipal = VerifiedFirebaseUser & {
  /** True when firebase.sign_in_provider === "anonymous". */
  isAnonymous: boolean;
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

/** Terminal Auth SDK failures — never fall through to Identity Toolkit. */
export function isTerminalFirebaseAuthSdkError(error: unknown): boolean {
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 401 || status === 403) return true;
  const code = String((error as { code?: string })?.code || "").toLowerCase();
  const message = String((error as Error)?.message || "").toLowerCase();
  const hay = `${code} ${message}`;
  return (
    hay.includes("auth/id-token-revoked") ||
    hay.includes("auth/id-token-expired") ||
    hay.includes("auth/user-disabled") ||
    hay.includes("auth/invalid-id-token") ||
    hay.includes("auth/argument-error") ||
    hay.includes("auth/session-cookie-revoked") ||
    hay.includes("auth/session-cookie-expired")
  );
}

function isLikelyAuthInfraFailure(error: unknown): boolean {
  if (isTerminalFirebaseAuthSdkError(error)) return false;
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 503) return true;
  const code = String((error as { code?: string })?.code || "").toLowerCase();
  const message = String((error as Error)?.message || "").toLowerCase();
  const hay = `${code} ${message}`;
  return (
    hay.includes("unavailable") ||
    hay.includes("deadline-exceeded") ||
    hay.includes("internal") ||
    hay.includes("econnreset") ||
    hay.includes("fetch failed") ||
    hay.includes("app/network-error")
  );
}

export function assertAdminAllowlist(email: string) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!isAdminEmail(normalized) || normalized !== ADMIN_EMAIL) {
    throw Object.assign(new Error("forbidden"), { status: 403 });
  }
}

async function verifyIdTokenWithAdminSdk(
  token: string,
  options?: { allowAnonymous?: boolean },
): Promise<VerifiedFirebasePrincipal> {
  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const { loadFirebaseAdminAuth } = await import("@/lib/admin/firebaseAdminNative");
  getRepairAdminDb();
  const { getAuth } = loadFirebaseAdminAuth();
  // checkRevoked=true — non-negotiable
  const decoded = await getAuth().verifyIdToken(token, true);
  const provider = String(
    (decoded as { firebase?: { sign_in_provider?: string } })?.firebase?.sign_in_provider || "",
  );
  const isAnonymous = provider === "anonymous";
  if (options?.allowAnonymous && isAnonymous) {
    return {
      email: "",
      uid: String(decoded.uid || ""),
      isAnonymous: true,
    };
  }
  if (decoded.email_verified !== true) {
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  }
  return {
    email: String(decoded.email || "").trim().toLowerCase(),
    uid: String(decoded.uid || ""),
    isAnonymous: false,
  };
}

async function verifyIdTokenViaIdentityToolkit(
  token: string,
  options?: { allowAnonymous?: boolean },
): Promise<VerifiedFirebasePrincipal> {
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
      providerUserInfo?: Array<{ providerId?: string }>;
    }>;
  };
  const user = payload.users?.[0];
  if (!user || user.disabled === true) {
    throw Object.assign(new Error("invalid_auth_token"), { status: 401 });
  }
  const providers = Array.isArray(user.providerUserInfo) ? user.providerUserInfo : [];
  const isAnonymous =
    providers.length === 0 ||
    providers.every((entry) => String(entry.providerId || "") === "anonymous");
  if (options?.allowAnonymous && isAnonymous) {
    return {
      email: "",
      uid: String(user.localId || ""),
      isAnonymous: true,
    };
  }
  if (user.emailVerified !== true) {
    throw Object.assign(new Error("invalid_auth_token"), { status: 401 });
  }
  return {
    email: String(user.email || "").trim().toLowerCase(),
    uid: String(user.localId || ""),
    isAnonymous: false,
  };
}

/**
 * Requires Authorization: Bearer <Firebase ID token> and resolves the Firebase
 * user without trusting a UID or email supplied by the client.
 * Admin SDK first (revoke check); Identity Toolkit only on infra/503.
 * Requires email_verified — not suitable for anonymous Auth visitors.
 */
export async function verifyFirebaseIdToken(req: Request): Promise<VerifiedFirebaseUser> {
  const token = readBearerToken(req);

  try {
    const principal = await verifyIdTokenWithAdminSdk(token);
    return { email: principal.email, uid: principal.uid };
  } catch (adminError) {
    if (isTerminalFirebaseAuthSdkError(adminError)) {
      const mapped = mapAdminAuthFailure(adminError);
      throw Object.assign(new Error(mapped.error), { status: mapped.status });
    }
    if (!isLikelyAuthInfraFailure(adminError)) {
      throw Object.assign(new Error("invalid_auth_token"), { status: 401 });
    }
  }

  try {
    const principal = await verifyIdTokenViaIdentityToolkit(token);
    return { email: principal.email, uid: principal.uid };
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 0);
    if (status === 403) throw error;
    throw Object.assign(new Error("invalid_auth_token"), { status: 401 });
  }
}

/**
 * Visitor principal for abuse IP stamp / send gate.
 * Allows Firebase anonymous Auth (no email) with revoke check intact.
 * Does NOT relax admin verification — use verifyAdminIdToken for admins.
 */
export async function verifyFirebaseIdTokenAllowingAnonymous(
  req: Request,
): Promise<VerifiedFirebasePrincipal> {
  const token = readBearerToken(req);

  try {
    return await verifyIdTokenWithAdminSdk(token, { allowAnonymous: true });
  } catch (adminError) {
    if (isTerminalFirebaseAuthSdkError(adminError)) {
      const mapped = mapAdminAuthFailure(adminError);
      throw Object.assign(new Error(mapped.error), { status: mapped.status });
    }
    if (!isLikelyAuthInfraFailure(adminError)) {
      throw Object.assign(new Error("invalid_auth_token"), { status: 401 });
    }
  }

  try {
    return await verifyIdTokenViaIdentityToolkit(token, { allowAnonymous: true });
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
    if (isTerminalFirebaseAuthSdkError(error)) {
      const mapped = mapAdminAuthFailure(error);
      throw Object.assign(new Error(mapped.error), { status: mapped.status });
    }
    if (!isLikelyAuthInfraFailure(error)) {
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
