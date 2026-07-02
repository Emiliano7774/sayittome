import { normalizeUsername } from "@/lib/profile/username";

type DedupeableProfile = {
  uid: string;
  authUid?: string;
  username: string;
  usernameLower?: string;
  email?: string;
  photo?: string;
  fotos?: string[];
  presenceAt?: string;
  lastActive?: string;
  shuffleFeatured?: boolean;
};

function canonicalUsernameFrom(value?: string) {
  const normalized = normalizeUsername(String(value || "")).toLowerCase();
  if (!normalized || normalized === "usuario" || normalized === "undefined") {
    return "";
  }
  return canonicalShuffleUsername(normalized);
}

/** All canonical username keys for a profile (handles stale usernameLower in Firestore). */
function usernameCanonicalCandidates(profile: {
  username?: string;
  usernameLower?: string;
}) {
  const fromUsername = canonicalUsernameFrom(profile.username);
  const fromStored = canonicalUsernameFrom(profile.usernameLower);
  const candidates = new Set<string>();
  if (fromUsername) candidates.add(fromUsername);
  if (fromStored) candidates.add(fromStored);
  return [...candidates];
}

export function resolveUsernameLower(profile: {
  username?: string;
  usernameLower?: string;
}) {
  const fromUsername = canonicalUsernameFrom(profile.username);
  if (fromUsername) return fromUsername;

  return canonicalUsernameFrom(profile.usernameLower);
}

/** Looser username match for dedupe: strips trailing punctuation variants. */
export function canonicalShuffleUsername(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+$/g, "");
}

export function resolveShuffleAuthUid(profile: {
  uid?: string;
  authUid?: string;
}) {
  const authUid = String(profile.authUid || "").trim();
  if (authUid) return authUid;

  return String(profile.uid || "").trim();
}

function normalizedUsername(profile: { username?: string; usernameLower?: string }) {
  return resolveUsernameLower(profile);
}

export function normalizeShufflePhotoKey(photo?: string) {
  const raw = String(photo || "").trim().toLowerCase();
  if (!raw) return "";

  const withoutQuery = raw.split("?")[0]?.split("#")[0] || "";

  try {
    const url = new URL(withoutQuery);
    const path = url.pathname.replace(/\/+$/, "");
    return path.length > 8 ? path : withoutQuery;
  } catch {
    return withoutQuery;
  }
}

function isGenericShufflePhotoKey(key: string) {
  if (!key || key.length < 12) return true;
  if (key.includes("placeholder")) return true;
  if (key.endsWith("/default") || key.endsWith("/default.jpg")) return true;
  return false;
}

function shuffleProfilePhotoKeys(profile: { photo?: string; fotos?: string[] }) {
  const keys = new Set<string>();
  const candidates = [profile.photo, ...(profile.fotos || [])];

  for (const candidate of candidates) {
    const photoKey = normalizeShufflePhotoKey(candidate);
    if (photoKey && !isGenericShufflePhotoKey(photoKey)) {
      keys.add(`p:${photoKey}`);
    }
  }

  return [...keys];
}

export function shuffleProfileIdentityKey(profile: {
  uid?: string;
  authUid?: string;
  username?: string;
  usernameLower?: string;
  email?: string;
}) {
  const username = resolveUsernameLower(profile);
  if (username) return `u:${username}`;

  const email = String(profile.email || "").trim().toLowerCase();
  if (email.includes("@")) return `e:${email}`;

  const uid = String(profile.uid || "").trim();
  return uid ? `id:${uid}` : "";
}

function profileRecencyMs(profile: {
  presenceAt?: string;
  lastActive?: string;
}) {
  const stamp = profile.presenceAt || profile.lastActive || "";
  const ms = stamp ? new Date(stamp).getTime() : 0;
  return Number.isNaN(ms) ? 0 : ms;
}

function pickNewerProfile<T extends DedupeableProfile>(a: T, b: T) {
  const aMs = profileRecencyMs(a);
  const bMs = profileRecencyMs(b);
  if (bMs !== aMs) return bMs > aMs ? b : a;
  if (Boolean(b.shuffleFeatured) !== Boolean(a.shuffleFeatured)) {
    return b.shuffleFeatured ? b : a;
  }
  return b.uid.length >= a.uid.length ? b : a;
}

function profileQualityScore(profile: DedupeableProfile) {
  let score = 0;
  if (profile.photo) score += 4;
  if (profileRecencyMs(profile) > 0) score += 2;
  if (Boolean(profile.shuffleFeatured)) score += 1;
  return score;
}

function pickBetterProfile<T extends DedupeableProfile>(a: T, b: T) {
  const aScore = profileQualityScore(a);
  const bScore = profileQualityScore(b);
  if (bScore !== aScore) return bScore > aScore ? b : a;
  return pickNewerProfile(a, b);
}

export function shuffleProfileDedupeKeys(profile: {
  uid?: string;
  authUid?: string;
  username?: string;
  usernameLower?: string;
  email?: string;
  photo?: string;
  fotos?: string[];
}) {
  const keys = new Set<string>();
  const identityKey = shuffleProfileIdentityKey(profile);
  const uid = String(profile.uid || "").trim();
  const authUid = resolveShuffleAuthUid(profile);
  const email = String(profile.email || "").trim().toLowerCase();

  if (identityKey) keys.add(identityKey);
  for (const usernameLower of usernameCanonicalCandidates(profile)) {
    keys.add(`u:${usernameLower}`);
    keys.add(`ul:${usernameLower}`);
  }
  if (authUid) keys.add(`auth:${authUid}`);
  if (uid) keys.add(`id:${uid}`);
  if (email.includes("@")) keys.add(`e:${email}`);
  for (const photoKey of shuffleProfilePhotoKeys(profile)) {
    keys.add(photoKey);
  }

  return [...keys];
}

export function profileMatchesShuffleExcludeKeys(
  profile: {
    uid?: string;
    authUid?: string;
    username?: string;
    usernameLower?: string;
    email?: string;
    photo?: string;
    fotos?: string[];
  },
  excludeKeys: ReadonlySet<string>,
) {
  if (excludeKeys.size === 0) return false;

  const batchKeys = shuffleProfileBatchExcludeKeys(profile);
  if (batchKeys.some((key) => excludeKeys.has(key))) return true;

  return shuffleProfileDedupeKeys(profile).some((key) => excludeKeys.has(key));
}

/** Keys used only to remember recently shown profiles between shuffle clicks. */
export function shuffleProfileBatchExcludeKeys(profile: {
  uid?: string;
  authUid?: string;
  email?: string;
}) {
  const keys = new Set<string>();
  const uid = String(profile.uid || "").trim();
  const authUid = String(profile.authUid || "").trim();
  const email = String(profile.email || "").trim().toLowerCase();

  if (uid) keys.add(`id:${uid}`);
  if (authUid && authUid !== uid) keys.add(`auth:${authUid}`);
  if (email.includes("@")) keys.add(`e:${email}`);

  return [...keys];
}

function dedupeKeysForProfile(profile: DedupeableProfile) {
  return shuffleProfileDedupeKeys(profile);
}

export function shuffleProfilesShareIdentity(
  left: { uid?: string; username?: string; usernameLower?: string; email?: string },
  right: { uid?: string; username?: string; usernameLower?: string; email?: string },
) {
  const rightKeys = new Set(shuffleProfileDedupeKeys(right));
  return shuffleProfileDedupeKeys(left).some((key) => rightKeys.has(key));
}

export function buildShuffleDedupeProfileFromFirestoreUser(user: Record<string, unknown>) {
  const docId = String(user.id || "").trim();
  const firebaseUid = String(user.uid || "").trim();
  const fotos = Array.isArray(user.fotos)
    ? user.fotos.map((value) => String(value || "")).filter(Boolean)
    : [];

  return {
    uid: docId || firebaseUid,
    authUid: firebaseUid || docId,
    username: String(user.username || user.nombre || user.usernameLower || ""),
    usernameLower: resolveUsernameLower({
      username: String(user.username || user.nombre || ""),
      usernameLower: String(user.usernameLower || ""),
    }),
    email: String(user.email || ""),
    photo: String(user.fotoPrincipal || user.photoURL || fotos[0] || ""),
    fotos,
  };
}
/** Collapse duplicate shuffle rows that share username, email, auth uid, doc id, or photo. */
export function dedupeShuffleProfiles<T extends DedupeableProfile>(
  profiles: T[],
): T[] {
  const canonicalByKey = new Map<string, string>();
  const merged = new Map<string, T>();

  for (const profile of profiles) {
    const keys = dedupeKeysForProfile(profile);
    if (keys.length === 0) continue;

    const existingCanonical = keys
      .map((key) => canonicalByKey.get(key))
      .find(Boolean);

    const canonicalKey = existingCanonical || keys[0];
    const existing = merged.get(canonicalKey);
    const next = existing ? pickBetterProfile(existing, profile) : profile;

    merged.set(canonicalKey, next);
    for (const key of keys) {
      canonicalByKey.set(key, canonicalKey);
    }
  }

  return [...merged.values()];
}

/** Keep one row per identity when building the visible shuffle window. */
export function uniqueShuffleWindow<T extends DedupeableProfile>(profiles: T[]): T[] {
  const used = new Set<string>();
  const unique: T[] = [];

  for (const profile of profiles) {
    const keys = shuffleProfileDedupeKeys(profile);
    if (keys.length > 0 && keys.some((key) => used.has(key))) continue;
    for (const key of keys) used.add(key);
    unique.push(profile);
  }

  return unique;
}
