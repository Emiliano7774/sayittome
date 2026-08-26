import { readClientCache, writeClientCache } from "@/lib/cache/clientCache";
import { applyShuffleAdminTagOverlay, setShuffleAdminTagOverlay } from "@/lib/shuffle/shuffleAdminTagOverlay";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export const PROFILE_CACHE_VERSION = 2;
export const PROFILE_CACHE_TTL_MS = 30 * 60_000;
export const PROFILE_CACHE_STALE_MS = 6 * 60 * 60_000;
export const PROFILE_FULL_CACHE_PREFIX = "sayittome:profile:full:v2:";
export const PROFILE_LITE_CACHE_PREFIX = "sayittome:profile:lite:v2:";
export const PROFILE_FULL_CACHE_MAX = 24;
export const PROFILE_LITE_CACHE_MAX = 48;

type CachedProfile = {
  uid: string;
  photo: string;
  blurPhoto: boolean;
  lastActive: string;
  online: boolean;
  fetchedAt: number;
};

export type FullProfileCacheSource = "api" | "shuffle-seed";

type FullProfileEnvelope = {
  version: number;
  username: string;
  profile: unknown;
  fetchedAt: number;
  source: FullProfileCacheSource;
};

const liteRam = new Map<string, CachedProfile>();
const fullRam = new Map<string, FullProfileEnvelope>();

function nowMs() {
  return Date.now();
}

function normalizeUsername(username: string) {
  return String(username || "").trim().toLowerCase();
}

function fullKey(username: string) {
  return `${PROFILE_FULL_CACHE_PREFIX}${username}`;
}

function liteKey(username: string) {
  return `${PROFILE_LITE_CACHE_PREFIX}${username}`;
}

function isFullEnvelope(value: unknown): value is FullProfileEnvelope {
  if (!value || typeof value !== "object") return false;
  const row = value as FullProfileEnvelope;
  return (
    row.version === PROFILE_CACHE_VERSION &&
    typeof row.username === "string" &&
    typeof row.fetchedAt === "number" &&
    row.profile != null
  );
}

function ageMs(fetchedAt: number, now = nowMs()) {
  return now - fetchedAt;
}

function pruneRam<T extends { fetchedAt: number }>(
  ram: Map<string, T>,
  max: number,
  persistRemove: (key: string) => void,
) {
  if (ram.size <= max) return;
  const ranked = [...ram.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  const overflow = ranked.slice(0, ram.size - max);
  for (const [key] of overflow) {
    ram.delete(key);
    persistRemove(key);
  }
}

function stripStoredKey(username: string, kind: "full" | "lite") {
  if (typeof window === "undefined") return;
  const key = kind === "full" ? fullKey(username) : liteKey(username);
  try {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function persistLite(username: string, row: CachedProfile | null) {
  if (!row) {
    liteRam.delete(username);
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(liteKey(username));
      window.localStorage.removeItem(liteKey(username));
    } catch {
      // ignore
    }
    return;
  }
  liteRam.set(username, row);
  pruneRam(liteRam, PROFILE_LITE_CACHE_MAX, (key) => stripStoredKey(key, "lite"));
  writeClientCache(liteKey(username), row);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      liteKey(username),
      JSON.stringify({ savedAt: row.fetchedAt, value: row }),
    );
  } catch {
    // ignore quota
  }
}

function persistFull(envelope: FullProfileEnvelope | null, username: string) {
  if (!envelope) {
    fullRam.delete(username);
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(fullKey(username));
      window.localStorage.removeItem(fullKey(username));
    } catch {
      // ignore
    }
    return;
  }
  fullRam.set(username, envelope);
  pruneRam(fullRam, PROFILE_FULL_CACHE_MAX, (key) => stripStoredKey(key, "full"));
  writeClientCache(fullKey(username), envelope);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      fullKey(username),
      JSON.stringify({ savedAt: envelope.fetchedAt, value: envelope }),
    );
  } catch {
    // ignore quota
  }
}

function readDurable<T>(
  key: string,
  ramHit: T | undefined,
  ttlMs: number,
  allowStale: boolean,
): T | null {
  if (ramHit) return ramHit;
  if (typeof window === "undefined") return null;

  const sessionHit = readClientCache<T>(key, allowStale ? PROFILE_CACHE_STALE_MS : ttlMs);
  if (sessionHit) return sessionHit;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; value?: T };
    if (!parsed?.savedAt || !parsed.value) return null;
    const maxAge = allowStale ? PROFILE_CACHE_STALE_MS : ttlMs;
    if (nowMs() - parsed.savedAt > maxAge) {
      window.localStorage.removeItem(key);
      return null;
    }
    writeClientCache(key, parsed.value);
    return parsed.value;
  } catch {
    return null;
  }
}

export function getCachedProfile(username: string) {
  const key = normalizeUsername(username);
  if (!key) return null;
  const ram = liteRam.get(key);
  if (ram && ageMs(ram.fetchedAt) <= PROFILE_CACHE_STALE_MS) return ram;
  const stored = readDurable<CachedProfile>(liteKey(key), ram, PROFILE_CACHE_TTL_MS, true);
  if (!stored) return null;
  if (ageMs(stored.fetchedAt) > PROFILE_CACHE_STALE_MS) return null;
  liteRam.set(key, stored);
  return stored;
}

export function setCachedProfile(
  username: string,
  data: Omit<CachedProfile, "fetchedAt">,
) {
  const key = normalizeUsername(username);
  if (!key) return;
  persistLite(key, {
    ...data,
    fetchedAt: nowMs(),
  });
}

export function isFullProfileCacheFresh(username: string, now = nowMs()) {
  const envelope = peekFullProfileEnvelope(username);
  if (!envelope) return false;
  return ageMs(envelope.fetchedAt, now) <= PROFILE_CACHE_TTL_MS;
}

export function peekFullProfileEnvelope(username: string) {
  const key = normalizeUsername(username);
  if (!key) return null;
  const ram = fullRam.get(key);
  if (ram && ram.version === PROFILE_CACHE_VERSION) return ram;
  const stored = readDurable<FullProfileEnvelope>(
    fullKey(key),
    ram,
    PROFILE_CACHE_TTL_MS,
    true,
  );
  if (!isFullEnvelope(stored)) return null;
  fullRam.set(key, stored);
  return stored;
}

export function isPaintableFullProfileCache(username: string) {
  const envelope = peekFullProfileEnvelope(username);
  if (!envelope) return false;
  return envelope.source !== "shuffle-seed";
}

export function getCachedFullProfile(username: string, options?: { allowStale?: boolean; allowPartial?: boolean }) {
  const envelope = peekFullProfileEnvelope(username);
  if (!envelope) return null;
  if (envelope.source === "shuffle-seed" && options?.allowPartial !== true) return null;
  const allowStale = options?.allowStale !== false;
  const maxAge = allowStale ? PROFILE_CACHE_STALE_MS : PROFILE_CACHE_TTL_MS;
  if (ageMs(envelope.fetchedAt) > maxAge) return null;
  const profile = envelope.profile as {
    uid?: string;
    moderationTag?: string;
    fakeProfileTag?: string;
  };
  const uid = String(profile?.uid || "").trim();
  if (uid) {
    return applyShuffleAdminTagOverlay({
      ...profile,
      uid,
    });
  }
  return envelope.profile;
}

export function setCachedFullProfile(
  username: string,
  profile: unknown,
  options?: { source?: FullProfileCacheSource; fetchedAt?: number },
) {
  if (!profile) return;
  const key = normalizeUsername(username);
  if (!key) return;
  const row = profile as { uid?: string };
  const stored =
    row?.uid && typeof profile === "object"
      ? applyShuffleAdminTagOverlay(profile as { uid: string; moderationTag?: string; fakeProfileTag?: string })
      : profile;
  persistFull(
    {
      version: PROFILE_CACHE_VERSION,
      username: key,
      profile: stored,
      fetchedAt: options?.fetchedAt || nowMs(),
      source: options?.source || "api",
    },
    key,
  );
}

export function patchCachedFullProfileAdminTags(
  username: string,
  patch: { moderationTag?: string; fakeProfileTag?: string },
) {
  const key = normalizeUsername(username);
  if (!key) return;
  const envelope = peekFullProfileEnvelope(key);
  if (!envelope?.profile || typeof envelope.profile !== "object") return;
  const current = envelope.profile as Record<string, unknown> & { uid?: string };
  persistFull(
    {
      ...envelope,
      profile: { ...current, ...patch },
    },
    key,
  );
  if (current.uid) {
    setShuffleAdminTagOverlay(current.uid, patch);
  }
}

export function seedFullProfileFromShuffleCard(profile: ShuffleProfile) {
  const username = normalizeUsername(profile.username);
  if (!username) return false;
  setCachedProfile(username, {
    uid: profile.uid,
    photo: profile.photo,
    blurPhoto: profile.blurPhoto,
    lastActive: profile.lastActive || "",
    online: profile.showOnline === true,
  });
  return true;
}

export function seedFullProfilesFromShuffleCards(profiles: ShuffleProfile[]) {
  let seeded = 0;
  for (const profile of profiles) {
    if (seedFullProfileFromShuffleCard(profile)) seeded += 1;
  }
  return seeded;
}

export function measureProfileCachePaint(username: string, now = nowMs()) {
  const envelope = peekFullProfileEnvelope(username);
  if (!envelope) {
    return { hit: false, fresh: false, stale: false, ageMs: null as number | null, source: null as string | null };
  }
  const age = ageMs(envelope.fetchedAt, now);
  return {
    hit: age <= PROFILE_CACHE_STALE_MS,
    fresh: age <= PROFILE_CACHE_TTL_MS,
    stale: age > PROFILE_CACHE_TTL_MS && age <= PROFILE_CACHE_STALE_MS,
    ageMs: age,
    source: envelope.source,
  };
}

export function shouldIdleRevalidateFullProfile(username: string) {
  const envelope = peekFullProfileEnvelope(username);
  if (!envelope || envelope.source === "shuffle-seed") return false;
  return !isFullProfileCacheFresh(username);
}

export function clearCachedFullProfile(username?: string) {
  if (username) {
    const key = normalizeUsername(username);
    persistFull(null, key);
    persistLite(key, null);
    return;
  }
  fullRam.clear();
  liteRam.clear();
  if (typeof window === "undefined") return;
  try {
    const prefixes = [PROFILE_FULL_CACHE_PREFIX, PROFILE_LITE_CACHE_PREFIX];
    for (const storage of [window.sessionStorage, window.localStorage]) {
      const toRemove: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
          toRemove.push(key);
        }
      }
      for (const key of toRemove) storage.removeItem(key);
    }
  } catch {
    // ignore
  }
}
