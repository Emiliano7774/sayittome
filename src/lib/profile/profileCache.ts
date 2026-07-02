type CachedProfile = {
  uid: string;
  photo: string;
  blurPhoto: boolean;
  lastActive: string;
  online: boolean;
  fetchedAt: number;
};

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, CachedProfile>();
const fullProfileCache = new Map<string, { profile: unknown; fetchedAt: number }>();

export function getCachedProfile(username: string) {
  const key = username.toLowerCase();
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit;
}

export function setCachedProfile(
  username: string,
  data: Omit<CachedProfile, "fetchedAt">,
) {
  cache.set(username.toLowerCase(), {
    ...data,
    fetchedAt: Date.now(),
  });
}

export function getCachedFullProfile(username: string) {
  const key = username.toLowerCase();
  const hit = fullProfileCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > CACHE_TTL_MS) {
    fullProfileCache.delete(key);
    return null;
  }
  return hit.profile;
}

export function setCachedFullProfile(username: string, profile: unknown) {
  if (!profile) return;
  fullProfileCache.set(username.toLowerCase(), {
    profile,
    fetchedAt: Date.now(),
  });
}

const prefetchInflight = new Map<string, Promise<void>>();

/** Warm profile JSON + main photo on hover/touch — skips if already cached. */
export function prefetchPublicProfile(username: string) {
  const key = username.trim().toLowerCase();
  if (!key || typeof window === "undefined") return;
  if (getCachedFullProfile(key)) return;
  if (prefetchInflight.has(key)) return;

  const promise = (async () => {
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(username)}?ts=${Date.now()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.profile) {
        setCachedFullProfile(key, json.profile);
        const photo = String(
          json.profile.fotoPrincipal || json.profile.photo || "",
        ).trim();
        if (photo) {
          const img = new Image();
          img.decoding = "async";
          img.src = photo;
        }
      }
    } catch {
      // Best-effort prefetch.
    } finally {
      prefetchInflight.delete(key);
    }
  })();

  prefetchInflight.set(key, promise);
}
