export function getStoriesPath(ownerUid?: string, username?: string) {
  const key = ownerUid || username;
  if (!key) return null;
  return `/stories/${encodeURIComponent(key)}`;
}
