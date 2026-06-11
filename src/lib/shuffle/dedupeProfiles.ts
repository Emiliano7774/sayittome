import { normalizeUsername } from "@/lib/profile/username";

type DedupeableProfile = {
  uid: string;
  username: string;
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
}) {
  const username = normalizedUsername(profile);
  if (username) return `u:${username}`;

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

/** Collapse duplicate shuffle rows that share username or uid. */
export function dedupeShuffleProfiles<T extends DedupeableProfile>(
  profiles: T[],
): T[] {
  const byIdentity = new Map<string, T>();

  for (const profile of profiles) {
    const identityKey = shuffleProfileIdentityKey(profile);
    if (!identityKey) continue;

    const existing = byIdentity.get(identityKey);
    byIdentity.set(identityKey, existing ? pickBetterProfile(existing, profile) : profile);
  }

  const byUid = new Map<string, T>();
  for (const profile of profiles) {
    const uid = String(profile.uid || "").trim();
    if (!uid) continue;

    const existing = byUid.get(uid);
    byUid.set(uid, existing ? pickBetterProfile(existing, profile) : profile);
  }

  const merged = new Map<string, T>();

  for (const [key, profile] of byIdentity) {
    merged.set(key, profile);
  }

  for (const profile of byUid.values()) {
    const identityKey = shuffleProfileIdentityKey(profile);
    if (!identityKey) continue;

    const existing = merged.get(identityKey);
    merged.set(identityKey, existing ? pickBetterProfile(existing, profile) : profile);
  }

  return [...merged.values()];
}
