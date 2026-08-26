import { readClientCache, writeClientCache } from "@/lib/cache/clientCache";

const STORAGE_KEY = "sayittome:shuffle:admin-tags:v1";
const TTL_MS = 24 * 60 * 60_000;

export type ShuffleAdminTagOverlay = {
  moderationTag?: string;
  fakeProfileTag?: string;
};

const ram = new Map<string, ShuffleAdminTagOverlay>();

function hydrateRamFromStorage() {
  if (typeof window === "undefined") return;
  const stored = readClientCache<Record<string, ShuffleAdminTagOverlay>>(STORAGE_KEY, TTL_MS);
  if (!stored || typeof stored !== "object") return;
  for (const [uid, row] of Object.entries(stored)) {
    if (uid && row && typeof row === "object") ram.set(uid, row);
  }
}

function persistRamToStorage() {
  if (typeof window === "undefined") return;
  const payload: Record<string, ShuffleAdminTagOverlay> = {};
  for (const [uid, row] of ram.entries()) payload[uid] = row;
  writeClientCache(STORAGE_KEY, payload);
}

export function setShuffleAdminTagOverlay(uid: string, patch: Partial<ShuffleAdminTagOverlay>) {
  const key = String(uid || "").trim();
  if (!key) return;
  if (ram.size === 0) hydrateRamFromStorage();
  ram.set(key, { ...(ram.get(key) || {}), ...patch });
  persistRamToStorage();
}

/** Server-confirmed tags only — never clears overlay on a stale miss. */
export function reconcileShuffleAdminTagOverlayFromServer(profile: {
  uid?: string;
  moderationTag?: string;
  fakeProfileTag?: string;
}) {
  const uid = String(profile.uid || "").trim();
  if (!uid) return;
  const patch: Partial<ShuffleAdminTagOverlay> = {};
  if (profile.fakeProfileTag === "fake") patch.fakeProfileTag = "fake";
  if (profile.moderationTag === "roleplay") patch.moderationTag = "roleplay";
  if (Object.keys(patch).length === 0) return;
  setShuffleAdminTagOverlay(uid, patch);
}

export function applyShuffleAdminTagOverlay<
  T extends { uid: string; moderationTag?: string; fakeProfileTag?: string },
>(profile: T): T {
  if (ram.size === 0) hydrateRamFromStorage();
  const overlay = ram.get(String(profile.uid || "").trim());
  if (!overlay) return profile;
  return {
    ...profile,
    ...(overlay.moderationTag !== undefined ? { moderationTag: overlay.moderationTag } : {}),
    ...(overlay.fakeProfileTag !== undefined ? { fakeProfileTag: overlay.fakeProfileTag } : {}),
  };
}

export function applyShuffleAdminTagOverlays<
  T extends { uid: string; moderationTag?: string; fakeProfileTag?: string },
>(profiles: T[]): T[] {
  if (profiles.length === 0) return profiles;
  return profiles.map(applyShuffleAdminTagOverlay);
}

export function mergeStickyShuffleAdminTags<
  T extends { moderationTag?: string; fakeProfileTag?: string },
>(incoming: T, existing?: T | null): T {
  if (!existing) return incoming;
  return {
    ...incoming,
    moderationTag: incoming.moderationTag || existing.moderationTag || "",
    fakeProfileTag: incoming.fakeProfileTag || existing.fakeProfileTag || "",
  };
}
