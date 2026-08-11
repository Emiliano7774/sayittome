export const STORIES_FIRESTORE_INDEX = {
  collection: "historias",
  fields: ["active", "expiresAt"] as const,
  order: "DESCENDING" as const,
  version: 1,
};

export type StoryIndexCandidate = {
  id: string;
  expiresAtMs: number;
  createdAtMs: number;
  active?: boolean;
  adminDeleted?: boolean;
};

export function compareStoriesNewestFirst(a: StoryIndexCandidate, b: StoryIndexCandidate) {
  const exp = Number(b.expiresAtMs || 0) - Number(a.expiresAtMs || 0);
  if (exp !== 0) return exp;
  const created = Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0);
  if (created !== 0) return created;
  return String(b.id || "").localeCompare(String(a.id || ""));
}

export function shouldKeepScanningStoryFallback(input: {
  pageSize: number;
  pageCount: number;
  lastPageSize: number;
  maxPages?: number;
}) {
  const pageSize = Math.max(1, Number(input.pageSize || 0));
  const lastPageSize = Number(input.lastPageSize || 0);
  const pageCount = Number(input.pageCount || 0);
  const maxPages = Math.max(1, Number(input.maxPages || 25));
  if (lastPageSize < pageSize) return false;
  if (pageCount >= maxPages) return false;
  return true;
}

export function selectStoriesForIndex(
  docs: StoryIndexCandidate[],
  options?: { limit?: number; now?: number },
) {
  const limit = Math.max(1, Number(options?.limit || 120));
  const now = Number(options?.now ?? Date.now());
  return [...docs]
    .filter((doc) => {
      if (doc.adminDeleted === true || doc.active === false) return false;
      const expires = Number(doc.expiresAtMs || 0);
      if (expires > 0 && expires <= now) return false;
      return Boolean(String(doc.id || "").trim());
    })
    .sort(compareStoriesNewestFirst)
    .slice(0, limit);
}
