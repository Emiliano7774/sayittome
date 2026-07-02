export function getStoriesPath(ownerUid?: string, username?: string) {
  const key = ownerUid || username;
  if (!key) return null;
  return `/stories/${encodeURIComponent(key)}`;
}

export function getStoryViewerPath(
  ownerKey?: string,
  storyId?: string,
) {
  const path = getStoriesPath(ownerKey, ownerKey);
  if (!path) return null;
  if (!storyId) return path;
  return `${path}?story=${encodeURIComponent(storyId)}`;
}
