/**
 * Pure Settings auth disposition — anonymous stays anonymous (gate, no redirects).
 * Registered incomplete redirects only when Settings is the active route.
 */

export type SettingsAuthUser = {
  uid: string;
  isAnonymous?: boolean;
  emailVerified?: boolean;
} | null;

export type SettingsAuthDisposition =
  | { kind: "loading" }
  | { kind: "anon_gate" }
  | { kind: "redirect"; path: string }
  | { kind: "load_profile"; uid: string }
  /** Registered user while Settings panel is hidden — never redirect from keepalive. */
  | { kind: "registered_hidden"; uid: string; needsVerifyEmail: boolean };

export function isRegisteredSettingsUser(user: SettingsAuthUser): boolean {
  return Boolean(user && !user.isAnonymous && String(user.uid || "").trim());
}

export function resolveSettingsAuthDisposition(input: {
  authReady: boolean;
  user: SettingsAuthUser;
  settingsRouteActive: boolean;
}): SettingsAuthDisposition {
  if (!input.authReady) return { kind: "loading" };

  const user = input.user;
  if (!user || user.isAnonymous) return { kind: "anon_gate" };

  const uid = String(user.uid || "").trim();
  if (!uid) return { kind: "anon_gate" };

  const needsVerify = user.emailVerified !== true;

  if (!input.settingsRouteActive) {
    return { kind: "registered_hidden", uid, needsVerifyEmail: needsVerify };
  }

  if (needsVerify) {
    return { kind: "redirect", path: "/register/verify-email" };
  }

  return { kind: "load_profile", uid };
}

/** Owner uid for Settings UI — never fall back to anonymous Firebase uid. */
export function resolveSettingsOwnerUid(input: {
  profileUid?: string | null;
  authUser: SettingsAuthUser;
}): string {
  if (!isRegisteredSettingsUser(input.authUser)) return "";
  const fromProfile = String(input.profileUid || "").trim();
  if (fromProfile) return fromProfile;
  return String(input.authUser?.uid || "").trim();
}

export type SettingsProfileCacheEnvelope = {
  uid: string;
  profile: Record<string, unknown>;
  savedAt?: number;
};

/** Only reuse cache when it matches the current registered auth uid. */
export function readTrustedSettingsProfileCache(
  raw: unknown,
  authUser: SettingsAuthUser,
): Record<string, unknown> | null {
  if (!isRegisteredSettingsUser(authUser)) return null;
  if (!raw || typeof raw !== "object") return null;
  const envelope = raw as SettingsProfileCacheEnvelope;
  const cachedUid = String(envelope.uid || "").trim();
  const authUid = String(authUser?.uid || "").trim();
  if (!cachedUid || cachedUid !== authUid) return null;
  if (!envelope.profile || typeof envelope.profile !== "object") return null;
  return envelope.profile as Record<string, unknown>;
}

export function buildSettingsProfileCacheEnvelope(
  authUid: string,
  profile: Record<string, unknown>,
): SettingsProfileCacheEnvelope | null {
  const uid = String(authUid || "").trim();
  if (!uid) return null;
  return { uid, profile, savedAt: Date.now() };
}

export function shouldLoadSettingsProfileOnFocus(input: {
  authUser: SettingsAuthUser;
  settingsRouteActive: boolean;
}): boolean {
  if (!input.settingsRouteActive) return false;
  if (!isRegisteredSettingsUser(input.authUser)) return false;
  if (input.authUser?.emailVerified !== true) return false;
  return true;
}

export function shouldAllowSettingsAccountRedirect(input: {
  settingsRouteActive: boolean;
  path: string;
}): boolean {
  if (!input.settingsRouteActive) return false;
  const path = String(input.path || "");
  return path.startsWith("/register");
}
