import { isAdminEmail } from "@/lib/admin/isAdmin";

/** Destination for a fully registered session (cold start + post-login). */
export const COMPLETE_POST_AUTH_PATH = "/shuffle";

/** Internal app paths allowed as post-login return targets (never auth gates). */
const APP_RETURN_EXACT = new Set([
  "/shuffle",
  "/chats",
  "/stories",
  "/stories/new",
  "/settings",
  "/settings/edit",
  "/boost",
  "/app",
  "/chat/new",
]);

const APP_RETURN_PREFIXES = [
  "/chat/",
  "/stories/",
  "/u/",
  "/settings/",
] as const;

function isAdminReturnPath(path: string) {
  return path === "/admin" || path.startsWith("/admin/");
}

function isAllowlistedAppPath(path: string) {
  if (APP_RETURN_EXACT.has(path)) return true;
  return APP_RETURN_PREFIXES.some(
    (prefix) => path.startsWith(prefix) && path.length > prefix.length,
  );
}

/**
 * Parse `?next=` into a same-origin relative path, or null if unsafe / open-redirect.
 */
export function sanitizeSafeReturnPath(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  let value = String(raw).trim();
  if (!value) return null;

  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }

  value = value.trim();
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  if (value.includes("://")) return null;
  if (/[\0\r\n]/.test(value)) return null;

  const pathOnly = value.split(/[?#]/, 1)[0] || "";
  if (!pathOnly.startsWith("/")) return null;
  if (pathOnly.includes("..")) return null;
  if (pathOnly === "/login" || pathOnly.startsWith("/login/")) return null;
  if (pathOnly === "/register" || pathOnly.startsWith("/register/")) return null;

  // Keep only the path (drop query/hash) to avoid smuggling hosts via odd encodings.
  return pathOnly;
}

/**
 * After verify/setup gates pass, optionally honor a sanitized `next`.
 * `/admin` only for the configured admin email; malicious/external → default.
 */
export function applyPreferredPostAuthPath(
  preferredNext: string | null | undefined,
  email?: string | null,
  fallback: string = COMPLETE_POST_AUTH_PATH,
): string {
  const path = sanitizeSafeReturnPath(preferredNext);
  if (!path) return fallback;

  if (isAdminReturnPath(path)) {
    return isAdminEmail(email) ? path : fallback;
  }

  if (isAllowlistedAppPath(path)) return path;
  return fallback;
}
