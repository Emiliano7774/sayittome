const PROFILE_ROUTE_CACHE_MS = 10 * 60_000;
const PROFILE_ROUTE_CACHE_MAX = 256;

const profileRouteCache = new Map<string, { savedAt: number; body: Record<string, unknown> }>();

function cacheKey(username: string) {
  return String(username || "").trim().toLowerCase();
}

export function readPublicProfileRouteCache(username: string) {
  const key = cacheKey(username);
  const cached = profileRouteCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.savedAt > PROFILE_ROUTE_CACHE_MS) {
    profileRouteCache.delete(key);
    return null;
  }
  return cached.body;
}

export function writePublicProfileRouteCache(username: string, body: Record<string, unknown>) {
  const key = cacheKey(username);
  if (!key) return;
  profileRouteCache.set(key, { savedAt: Date.now(), body });
  if (profileRouteCache.size <= PROFILE_ROUTE_CACHE_MAX) return;
  const oldest = [...profileRouteCache.entries()]
    .sort((a, b) => a[1].savedAt - b[1].savedAt)
    .slice(0, profileRouteCache.size - PROFILE_ROUTE_CACHE_MAX);
  for (const [oldKey] of oldest) profileRouteCache.delete(oldKey);
}

export function invalidatePublicProfileRouteCache(username: string) {
  const key = cacheKey(username);
  if (key) profileRouteCache.delete(key);
}
