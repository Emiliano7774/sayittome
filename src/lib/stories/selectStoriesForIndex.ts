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

export const STORIES_QUERY_PAGE_SIZE = 120;
export const STORIES_QUERY_MAX_DOCS = 3000;

export function shouldFetchNextStoriesPage(input: {
  lastPageSize: number;
  pageSize: number;
  collected: number;
  maxDocs?: number;
}) {
  const pageSize = Math.max(1, Number(input.pageSize || 0));
  const lastPageSize = Number(input.lastPageSize || 0);
  const collected = Number(input.collected || 0);
  const maxDocs = Math.max(pageSize, Number(input.maxDocs || STORIES_QUERY_MAX_DOCS));
  if (lastPageSize < pageSize) return false;
  if (collected >= maxDocs) return false;
  return true;
}

export function selectStoriesForIndex(
  docs: StoryIndexCandidate[],
  options?: { limit?: number; now?: number },
) {
  const rawLimit = options?.limit;
  const unlimited = rawLimit == null;
  const limit = unlimited ? Number.POSITIVE_INFINITY : Math.max(1, Number(rawLimit));
  const now = Number(options?.now ?? Date.now());
  const selected = [...docs]
    .filter((doc) => {
      if (doc.adminDeleted === true || doc.active === false) return false;
      const expires = Number(doc.expiresAtMs || 0);
      if (expires > 0 && expires <= now) return false;
      return Boolean(String(doc.id || "").trim());
    })
    .sort(compareStoriesNewestFirst);
  return Number.isFinite(limit) ? selected.slice(0, limit) : selected;
}

type MergeableStory = {
  id: string;
  expiresAtMs?: number;
  createdAtMs?: number;
  adminDeleted?: boolean;
  active?: boolean;
};

type MergeableGroup<TStory extends MergeableStory> = {
  ownerUid: string;
  stories: TStory[];
};

function storyStillActive(story: MergeableStory, now: number) {
  if (!String(story?.id || "").trim()) return false;
  if (story.adminDeleted === true || story.active === false) return false;
  const expires = Number(story.expiresAtMs || 0);
  return !(expires > 0 && expires <= now);
}

export function shouldKeepStoryInReconstruction(doc: StoryIndexCandidate, now = Date.now()) {
  if (!String(doc?.id || "").trim()) return false;
  if (doc.adminDeleted === true || doc.active === false) return false;
  const expires = Number(doc.expiresAtMs || 0);
  return !(expires > 0 && expires <= now);
}

/** Union still-valid indexed + historical rows so hidden-but-live stories come back. */
export function reconstructActiveStorySet<T extends StoryIndexCandidate>(
  indexed: T[],
  historical: T[] = [],
  now = Date.now(),
) {
  const byId = new Map<string, T>();
  for (const row of [...indexed, ...historical]) {
    if (!shouldKeepStoryInReconstruction(row, now)) continue;
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort(compareStoriesNewestFirst);
}

/** Incoming network rows win; still-active previous stories are kept if a page was truncated. */
export function mergeActiveStoryGroups<TStory extends MergeableStory, TGroup extends MergeableGroup<TStory>>(
  incoming: TGroup[],
  previous: TGroup[],
  now = Date.now(),
): TGroup[] {
  const storiesById = new Map<string, TStory>();
  const ownerStories = new Map<string, TStory[]>();
  const ownerMeta = new Map<string, TGroup>();

  const ingest = (groups: TGroup[]) => {
    for (const group of groups || []) {
      const ownerUid = String(group?.ownerUid || "").trim();
      if (!ownerUid) continue;
      if (!ownerMeta.has(ownerUid)) ownerMeta.set(ownerUid, group);
      for (const story of group.stories || []) {
        if (!storyStillActive(story, now)) continue;
        if (storiesById.has(story.id)) continue;
        storiesById.set(story.id, story);
        const list = ownerStories.get(ownerUid) || [];
        list.push(story);
        ownerStories.set(ownerUid, list);
      }
    }
  };

  ingest(incoming);
  ingest(previous);

  return [...ownerMeta.values()]
    .map((group) => {
      const stories = (ownerStories.get(group.ownerUid) || [])
        .slice()
        .sort((a, b) => Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0));
      if (stories.length === 0) return null;
      return { ...group, stories };
    })
    .filter((group): group is TGroup => Boolean(group))
    .sort((a, b) => {
      const aMax = a.stories[a.stories.length - 1]?.createdAtMs || 0;
      const bMax = b.stories[b.stories.length - 1]?.createdAtMs || 0;
      return Number(bMax) - Number(aMax);
    });
}
