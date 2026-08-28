import "server-only";

import { ADMIN_EMAIL } from "@/lib/admin/isAdmin";
import {
  assertAdminAllowlist,
  readBearerToken,
  type VerifiedAdmin,
} from "@/lib/admin/verifyAdminRequest";

const AUTH_CLIENT_ERROR_CODES = new Set([
  "auth/argument-error",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/session-cookie-expired",
  "auth/session-cookie-revoked",
  "auth/user-disabled",
]);

const INFRA_ERROR_CODES = new Set([
  "auth/internal-error",
  "auth/network-request-failed",
  "auth/timeout",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

export type P0DiagDecodedIdToken = {
  email?: string;
  uid?: string;
  email_verified?: boolean;
};

export type P0DiagVerifyDeps = {
  verifyIdToken: (token: string, checkRevoked: boolean) => Promise<P0DiagDecodedIdToken>;
};

function readFirebaseErrorCode(error: unknown): string {
  const direct = String((error as { code?: string })?.code || "").trim();
  if (direct) return direct;
  return String((error as { errorInfo?: { code?: string } })?.errorInfo?.code || "").trim();
}

/** Maps Admin SDK errors — never falls back to Identity Toolkit. */
export function mapP0DiagStrictSdkError(error: unknown): { status: number; error: string } {
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 403) return { status: 403, error: "forbidden" };
  if (status === 401) return { status: 401, error: "unauthorized" };
  if (status === 503) return { status: 503, error: "unavailable" };

  const code = readFirebaseErrorCode(error);
  if (code && AUTH_CLIENT_ERROR_CODES.has(code)) {
    return { status: 401, error: "unauthorized" };
  }

  const message = String((error as Error)?.message || "").toLowerCase();
  if (
    message.includes("id-token-revoked") ||
    message.includes("id token has been revoked") ||
    message.includes("id-token-expired") ||
    message.includes("expired") ||
    message.includes("disabled")
  ) {
    return { status: 401, error: "unauthorized" };
  }

  if (code && INFRA_ERROR_CODES.has(code)) {
    return { status: 503, error: "unavailable" };
  }
  if (
    message.includes("network") ||
    message.includes("unavailable") ||
    message.includes("internal error") ||
    message.includes("credential") ||
    message.includes("could not load the default credentials")
  ) {
    return { status: 503, error: "unavailable" };
  }

  if (code.startsWith("auth/")) {
    return { status: 401, error: "unauthorized" };
  }

  return { status: 503, error: "unavailable" };
}

export async function verifyAdminTokenStrictWithDeps(
  token: string,
  deps: P0DiagVerifyDeps,
): Promise<VerifiedAdmin> {
  try {
    const decoded = await deps.verifyIdToken(token, true);
    if (decoded.email_verified !== true) {
      throw Object.assign(new Error("unauthorized"), { status: 401 });
    }
    const email = String(decoded.email || "").trim().toLowerCase();
    const uid = String(decoded.uid || "");
    if (!email || !uid) {
      throw Object.assign(new Error("unauthorized"), { status: 401 });
    }
    assertAdminAllowlist(email);
    return { email, uid };
  } catch (error) {
    const mappedStatus = Number((error as { status?: number })?.status || 0);
    if (mappedStatus === 403) {
      throw Object.assign(new Error("forbidden"), { status: 403 });
    }
    if (mappedStatus === 401) {
      throw Object.assign(new Error("unauthorized"), { status: 401 });
    }
    const mapped = mapP0DiagStrictSdkError(error);
    throw Object.assign(new Error(mapped.error), { status: mapped.status });
  }
}

async function loadDefaultSdkDeps(): Promise<P0DiagVerifyDeps> {
  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const { loadFirebaseAdminAuth } = await import("@/lib/admin/firebaseAdminNative");
  getRepairAdminDb();
  const { getAuth } = loadFirebaseAdminAuth();
  return {
    verifyIdToken: (idToken, checkRevoked) => getAuth().verifyIdToken(idToken, checkRevoked),
  };
}

/**
 * P0 diagnostic routes only: SDK verifyIdToken(token,true) + emailVerified + allowlist.
 * No Identity Toolkit fallback. Revoked/expired/disabled/invalid → 401; non-admin → 403; infra → 503.
 */
export async function verifyAdminIdTokenStrictForP0Diag(req: Request): Promise<VerifiedAdmin> {
  const token = readBearerToken(req);
  const deps = await loadDefaultSdkDeps();
  return verifyAdminTokenStrictWithDeps(token, deps);
}

export function p0DiagStrictAuthErrorBody(status: number): { ok: false; error: string } {
  if (status === 403) return { ok: false, error: "forbidden" };
  if (status === 503) return { ok: false, error: "unavailable" };
  return { ok: false, error: "unauthorized" };
}

export function isP0DiagStrictAdminEmail(email: string) {
  return String(email || "").trim().toLowerCase() === ADMIN_EMAIL;
}
