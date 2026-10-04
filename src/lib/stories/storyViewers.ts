export type StoryViewerKind = "profile" | "anon";

export type StoryViewerRow = {
  id: string;
  kind: StoryViewerKind;
  username: string;
  photo: string;
  pais: string;
  provincia: string;
  locationLabel: string;
  liked: boolean;
  viewedAtMs: number;
  likedAtMs: number;
};

export function isAnonymousStoryViewerId(id: string) {
  return String(id || "").trim().startsWith("anon_");
}

export function formatStoryViewerLocation(input: { pais?: string; provincia?: string; countryName?: string }) {
  const region = String(input.provincia || "").trim();
  const country = String(input.countryName || input.pais || "").trim();
  if (region && country) return `${region}, ${country}`;
  return region || country;
}

export function collectStoryViewerIds(input: {
  viewedBy?: Record<string, boolean>;
  viewedByAnon?: Record<string, boolean>;
  likedBy?: Record<string, boolean>;
  ownerUid?: string;
}) {
  const ids = new Set<string>();
  for (const [id, value] of Object.entries(input.viewedBy || {})) {
    if (value) ids.add(id);
  }
  for (const [id, value] of Object.entries(input.viewedByAnon || {})) {
    if (value) ids.add(id);
  }
  for (const [id, value] of Object.entries(input.likedBy || {})) {
    if (value) ids.add(id);
  }
  const owner = String(input.ownerUid || "").trim();
  if (owner) ids.delete(owner);
  return [...ids].filter(Boolean);
}

export function compareStoryViewers(a: StoryViewerRow, b: StoryViewerRow) {
  if (a.liked !== b.liked) return a.liked ? -1 : 1;
  if (a.liked && b.liked) {
    const aLike = a.likedAtMs > 0 ? a.likedAtMs : Number.MAX_SAFE_INTEGER;
    const bLike = b.likedAtMs > 0 ? b.likedAtMs : Number.MAX_SAFE_INTEGER;
    if (aLike !== bLike) return aLike - bLike;
    return a.id.localeCompare(b.id);
  }
  if (a.viewedAtMs !== b.viewedAtMs) return b.viewedAtMs - a.viewedAtMs;
  return a.id.localeCompare(b.id);
}

export function mergeStoryViewerRows(
  rows: Array<Partial<StoryViewerRow> & { id: string }>,
): StoryViewerRow[] {
  const byId = new Map<string, StoryViewerRow>();
  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    const prev = byId.get(id);
    const next: StoryViewerRow = {
      id,
      kind: row.kind || prev?.kind || (isAnonymousStoryViewerId(id) ? "anon" : "profile"),
      username: String(row.username || prev?.username || "").trim(),
      photo: String(row.photo || prev?.photo || "").trim(),
      pais: String(row.pais || prev?.pais || "").trim(),
      provincia: String(row.provincia || prev?.provincia || "").trim(),
      locationLabel: String(row.locationLabel || prev?.locationLabel || "").trim(),
      liked: row.liked === true || prev?.liked === true,
      viewedAtMs: Math.max(Number(row.viewedAtMs || 0), Number(prev?.viewedAtMs || 0)),
      likedAtMs: Math.max(Number(row.likedAtMs || 0), Number(prev?.likedAtMs || 0)),
    };
    if (!next.locationLabel) {
      next.locationLabel = formatStoryViewerLocation(next);
    }
    if (next.kind === "profile" && !next.username) {
      next.kind = isAnonymousStoryViewerId(id) ? "anon" : next.kind;
    }
    byId.set(id, next);
  }
  return [...byId.values()].sort(compareStoryViewers);
}

export function canReplyToStory(input: {
  isOwner: boolean;
  anonymousStory: boolean;
  hasUsername: boolean;
}) {
  return !input.isOwner && !input.anonymousStory && input.hasUsername;
}
