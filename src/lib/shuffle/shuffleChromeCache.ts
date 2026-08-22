import { readClientCache, writeClientCache } from "@/lib/cache/clientCache";
import { dedupeShuffleProfiles } from "@/lib/shuffle/dedupeProfiles";
import type { FollowingProfile } from "@/lib/shuffle/followingTypes";

export const SHUFFLE_CHROME_CACHE_VERSION = 3;
export const SHUFFLE_FOLLOWING_CACHE_KEY = "sayittome:shuffle:following:v3";
export const SHUFFLE_ANON_CARD_CACHE_KEY = "sayittome:shuffle:anon-card:v3";
export const SHUFFLE_CHROME_TTL_MS = 30 * 60_000;

export type FollowingSnapshot = {
  version: number;
  uid: string;
  profiles: FollowingProfile[];
  hasSession: boolean;
};

export type AnonCardSnapshot = {
  version: number;
  uid: string;
  show: boolean;
  hiddenForActiveChat: boolean;
  isIncognitoVisitor: boolean;
  isProfileUser: boolean;
  searching: boolean;
};

let followingRam: FollowingSnapshot | null = null;
let anonCardRam: AnonCardSnapshot | null = null;

function cloneFollowing(snapshot: FollowingSnapshot): FollowingSnapshot {
  return {
    version: SHUFFLE_CHROME_CACHE_VERSION,
    uid: snapshot.uid,
    hasSession: snapshot.hasSession,
    profiles: dedupeShuffleProfiles(snapshot.profiles.map((profile) => ({ ...profile }))),
  };
}

function cloneAnon(snapshot: AnonCardSnapshot): AnonCardSnapshot {
  return { ...snapshot };
}

function isFollowingSnapshot(value: unknown): value is FollowingSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as FollowingSnapshot;
  return (
    row.version === SHUFFLE_CHROME_CACHE_VERSION &&
    typeof row.uid === "string" &&
    Array.isArray(row.profiles)
  );
}

function isAnonCardSnapshot(value: unknown): value is AnonCardSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as AnonCardSnapshot;
  return (
    row.version === SHUFFLE_CHROME_CACHE_VERSION &&
    typeof row.uid === "string" &&
    typeof row.show === "boolean"
  );
}

function persistFollowing(snapshot: FollowingSnapshot | null) {
  followingRam = snapshot ? cloneFollowing(snapshot) : null;
  if (!snapshot) {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(SHUFFLE_FOLLOWING_CACHE_KEY);
    } catch {
      // ignore
    }
    return;
  }
  writeClientCache(SHUFFLE_FOLLOWING_CACHE_KEY, cloneFollowing(snapshot));
}

function persistAnon(snapshot: AnonCardSnapshot | null) {
  anonCardRam = snapshot ? cloneAnon(snapshot) : null;
  if (!snapshot) {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(SHUFFLE_ANON_CARD_CACHE_KEY);
    } catch {
      // ignore
    }
    return;
  }
  writeClientCache(SHUFFLE_ANON_CARD_CACHE_KEY, cloneAnon(snapshot));
}

export function resetShuffleChromeRamCache() {
  followingRam = null;
  anonCardRam = null;
}

export function readCachedFollowingSnapshot(uid: string) {
  const expected = String(uid || "").trim();
  if (!expected) return null;
  if (followingRam && followingRam.version === SHUFFLE_CHROME_CACHE_VERSION) {
    if (followingRam.uid === expected) return cloneFollowing(followingRam);
    return null;
  }

  const stored = readClientCache<FollowingSnapshot>(
    SHUFFLE_FOLLOWING_CACHE_KEY,
    SHUFFLE_CHROME_TTL_MS,
  );
  if (!isFollowingSnapshot(stored)) return null;
  followingRam = cloneFollowing(stored);
  if (stored.uid === expected) return cloneFollowing(stored);
  return null;
}

export function writeCachedFollowingSnapshot(
  uid: string,
  profiles: FollowingProfile[],
  hasSession: boolean,
) {
  const nextUid = String(uid || "").trim();
  if (!nextUid) {
    persistFollowing(null);
    return;
  }
  persistFollowing({
    version: SHUFFLE_CHROME_CACHE_VERSION,
    uid: nextUid,
    profiles: profiles.map((profile) => ({ ...profile })),
    hasSession,
  });
}

export function readCachedAnonCardSnapshot(uid?: string) {
  const expected = String(uid || "").trim();
  if (!expected) return null;
  if (anonCardRam && anonCardRam.version === SHUFFLE_CHROME_CACHE_VERSION) {
    if (anonCardRam.uid === expected) return cloneAnon(anonCardRam);
    return null;
  }

  const stored = readClientCache<AnonCardSnapshot>(
    SHUFFLE_ANON_CARD_CACHE_KEY,
    SHUFFLE_CHROME_TTL_MS,
  );
  if (!isAnonCardSnapshot(stored)) return null;
  anonCardRam = cloneAnon(stored);
  if (stored.uid === expected) return cloneAnon(stored);
  return null;
}

export function writeCachedAnonCardSnapshot(
  snapshot: Omit<AnonCardSnapshot, "version" | "uid" | "hiddenForActiveChat"> & {
    uid?: string;
    version?: number;
    hiddenForActiveChat?: boolean;
  },
) {
  persistAnon({
    version: SHUFFLE_CHROME_CACHE_VERSION,
    uid: String(snapshot.uid || "").trim(),
    show: Boolean(snapshot.show),
    hiddenForActiveChat: Boolean(snapshot.hiddenForActiveChat),
    isIncognitoVisitor: Boolean(snapshot.isIncognitoVisitor),
    isProfileUser: Boolean(snapshot.isProfileUser),
    searching: Boolean(snapshot.searching),
  });
}

export function clearShuffleChromeCache() {
  persistFollowing(null);
  persistAnon(null);
}
