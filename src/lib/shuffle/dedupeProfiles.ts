import { normalizeUsername } from "@/lib/profile/username";

type DedupeableProfile = {
  uid: string;
  username: string;
  email?: string;
  photo?: string;
  presenceAt?: string;
  lastActive?: string;
  shuffleFeatured?: boolean;
};

function normalizedUsername(profile: { username?: string }) {
  const username = normalizeUsername(String(profile.username || "")).toLowerCase();
  if (!username || username === "usuario" || username === "undefined") {
    return "";
  }
  return username;
}

export function shuffleProfileIdentityKey(profile: {
  uid?: string;
  username?: string;
  email?: string;
}) {
  const username = normalizedUsername(profile);
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

function dedupeKeysForProfile(profile: DedupeableProfile) {
  const keys = new Set<string>();
  const identityKey = shuffleProfileIdentityKey(profile);
  const uid = String(profile.uid || "").trim();

  if (identityKey) keys.add(identityKey);
  if (uid) keys.add(`id:${uid}`);

  return [...keys];
}

/** Collapse duplicate shuffle rows that share username, email, or uid. */
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
