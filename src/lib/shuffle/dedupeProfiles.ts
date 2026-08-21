import { normalizeUsername } from "@/lib/profile/username";

export const SHUFFLE_DEDUPE_VERSION = 16;

export type ShuffleIdentitySource = "cache" | "live" | "featured" | "page" | "unknown";

type DedupeableProfile = {
  uid: string;
  authUid?: string;
  id?: string;
  docId?: string;
  profileUid?: string;
  firebaseUid?: string;
  ownerUid?: string;
  aliasIds?: string[];
  username: string;
  usernameLower?: string;
  usernameAliases?: string[];
  email?: string;
  photo?: string;
  bio?: string;
  fotos?: string[];
  presenceAt?: string;
  lastActive?: string;
  shuffleFeatured?: boolean;
  shuffleSource?: ShuffleIdentitySource;
};

const ID_FIELDS = [
  "uid",
  "authUid",
  "id",
  "docId",
  "profileUid",
  "firebaseUid",
  "ownerUid",
] as const;

function canonicalUsernameFrom(value?: string) {
  const normalized = normalizeUsername(String(value || "")).toLowerCase();
  if (!normalized || normalized === "usuario" || normalized === "undefined") {
    return "";
  }
  return canonicalShuffleUsername(normalized);
}

/** All canonical username keys for a profile (handles stale usernameLower in Firestore). */
function usernameCanonicalCandidates(profile: {
  username?: string;
  usernameLower?: string;
  usernameAliases?: string[];
}) {
  const candidates = new Set<string>();
  const fromUsername = canonicalUsernameFrom(profile.username);
  const fromStored = canonicalUsernameFrom(profile.usernameLower);
  if (fromUsername) candidates.add(fromUsername);
  if (fromStored) candidates.add(fromStored);
  if (Array.isArray(profile.usernameAliases)) {
    for (const alias of profile.usernameAliases) {
      const next = canonicalUsernameFrom(alias);
      if (next) candidates.add(next);
    }
  }
  return [...candidates];
}

export function resolveUsernameLower(profile: {
  username?: string;
  usernameLower?: string;
}) {
  const fromUsername = canonicalUsernameFrom(profile.username);
  if (fromUsername) return fromUsername;

  return canonicalUsernameFrom(profile.usernameLower);
}

/** Looser username match for dedupe: strips trailing punctuation variants. */
export function canonicalShuffleUsername(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+$/g, "");
}

export function resolveShuffleAuthUid(profile: {
  uid?: string;
  authUid?: string;
}) {
  const authUid = String(profile.authUid || "").trim();
  if (authUid) return authUid;

  return String(profile.uid || "").trim();
}

const ANON_SESSION_UID_RE = /^anon[_-]/i;

export function isAnonShuffleSessionUid(value?: string) {
  return ANON_SESSION_UID_RE.test(String(value || "").trim());
}

export function isAnonShuffleProfile(profile: { uid?: string; authUid?: string }) {
  return (
    isAnonShuffleSessionUid(profile.uid) || isAnonShuffleSessionUid(profile.authUid)
  );
}

function canonicalEmailFrom(value?: string) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return "";
  if (email.endsWith(".invalid") || email.includes("anonymous")) return "";
  return email;
}

function isWeakJoinUsername(username: string) {
  return /^(guest|anon|anonymous|user|usuario|undefined)$/i.test(username);
}

export function normalizeShufflePhotoKey(photo?: string) {
  const raw = String(photo || "").trim().toLowerCase();
  if (!raw) return "";

  const withoutQuery = raw.split("?")[0]?.split("#")[0] || "";

  try {
    const url = new URL(withoutQuery);
    const path = url.pathname.replace(/\/+$/, "");
    return path.length > 8 ? path : withoutQuery;
  } catch {
    return withoutQuery;
  }
}

function uniqueStrings(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const token = String(value || "").trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    next.push(token);
  }
  return next;
}

function hashToken(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function collectShuffleIdTokens(profile: Record<string, unknown> | DedupeableProfile) {
  const row = profile as Record<string, unknown>;
  const tokens: string[] = [];
  const seen = new Set<string>();

  const add = (value: unknown) => {
    const token = String(value || "").trim();
    if (!token || seen.has(token)) return;
    seen.add(token);
    tokens.push(token);
  };

  for (const field of ID_FIELDS) {
    add(row[field]);
  }
  if (Array.isArray(row.aliasIds)) {
    for (const alias of row.aliasIds) add(alias);
  }
  return tokens;
}

function hasHardIdentityEvidence(
  profile: { authUid?: string; email?: string },
  ids: string[],
) {
  if (String(profile.authUid || "").trim()) return true;
  if (canonicalEmailFrom(profile.email)) return true;
  if (ids.length > 1) return true;
  return false;
}

function visualIdentitySeed(profile: {
  uid?: string;
  authUid?: string;
  username?: string;
  usernameLower?: string;
  aliasIds?: string[];
  firebaseUid?: string;
  profileUid?: string;
  ownerUid?: string;
  id?: string;
  docId?: string;
}) {
  const ids = collectShuffleIdTokens(profile);
  const anonIds = ids.filter((id) => isAnonShuffleSessionUid(id)).sort();
  if (anonIds.length > 0) return `anon:${anonIds.join("|")}`;

  const authUid = String(profile.authUid || "").trim();
  const firebaseUid = String((profile as DedupeableProfile).firebaseUid || "").trim();
  const authLike = [...new Set([authUid, firebaseUid].filter(Boolean))].filter(
    (value) => !isAnonShuffleSessionUid(value),
  );
  if (authLike.length > 0) {
    return `auth:${authLike.sort().join("|")}`;
  }

  if (ids.length > 0) return `ids:${[...ids].sort().join("|")}`;

  const username = resolveUsernameLower(profile);
  if (username) return `user:${username}`;

  return "";
}

function hashIdentitySeed(seed: string) {
  if (!seed) return "";
  return `${hashToken(seed)}${hashToken(`~${seed}`)}`;
}

/** Stable React key: local hash of the identity seed, never a raw UID. */
export function shuffleProfileIdentityKey(profile: {
  uid?: string;
  authUid?: string;
  username?: string;
  usernameLower?: string;
  email?: string;
  aliasIds?: string[];
  firebaseUid?: string;
  profileUid?: string;
  ownerUid?: string;
  id?: string;
  docId?: string;
}) {
  const hashed = hashIdentitySeed(visualIdentitySeed(profile));
  return hashed ? `sid:${hashed}` : "";
}

function profileRecencyMs(profile: {
  presenceAt?: string;
  lastActive?: string;
}) {
  const stamp = profile.presenceAt || profile.lastActive || "";
  const ms = stamp ? new Date(stamp).getTime() : 0;
  return Number.isNaN(ms) ? 0 : ms;
}

function pickNewerProfile<T extends DedupeableProfile>(a: T, b: T) {
  const aMs = profileRecencyMs(a);
  const bMs = profileRecencyMs(b);
  if (bMs !== aMs) return bMs > aMs ? b : a;
  if (Boolean(b.shuffleFeatured) !== Boolean(a.shuffleFeatured)) {
    return b.shuffleFeatured ? b : a;
  }
  return b;
}

function profileQualityScore(profile: DedupeableProfile) {
  let score = 0;
  if (profile.photo) score += 8;
  if (Array.isArray(profile.fotos)) score += Math.min(profile.fotos.length, 6);
  if (String(profile.bio || "").trim()) score += 3;
  if (profileRecencyMs(profile) > 0) score += 2;
  if (Boolean(profile.shuffleFeatured)) score += 1;
  if (String(profile.authUid || "").trim()) score += 1;
  if (resolveUsernameLower(profile)) score += 1;
  return score;
}

function pickBetterProfile<T extends DedupeableProfile>(a: T, b: T) {
  const aScore = profileQualityScore(a);
  const bScore = profileQualityScore(b);
  if (bScore !== aScore) return bScore > aScore ? b : a;
  return pickNewerProfile(a, b);
}

function mergeIdentityFields<T extends DedupeableProfile>(winner: T, loser: T): T {
  const aliasIds = uniqueStrings([
    ...collectShuffleIdTokens(winner),
    ...collectShuffleIdTokens(loser),
  ]);
  const usernameAliases = uniqueStrings([
    ...(winner.usernameAliases || []),
    ...(loser.usernameAliases || []),
    winner.username,
    loser.username,
    winner.usernameLower,
    loser.usernameLower,
  ].map((value) => canonicalUsernameFrom(value)));
  const actionUid = String(winner.uid || "").trim() || String(loser.uid || "").trim();
  const authCandidates = uniqueStrings([
    winner.authUid,
    loser.authUid,
    winner.firebaseUid,
    loser.firebaseUid,
  ]).filter((id) => !isAnonShuffleSessionUid(id));
  const winnerAuth = String(winner.authUid || "").trim();
  const authUid = winnerAuth || authCandidates[0] || "";
  const otherAuth =
    authCandidates.find((id) => id !== authUid) ||
    String(winner.firebaseUid || "").trim() ||
    String(loser.firebaseUid || "").trim() ||
    authUid;

  return {
    ...loser,
    ...winner,
    uid: actionUid,
    authUid: authUid || winner.authUid || loser.authUid,
    email: winner.email || loser.email,
    aliasIds,
    usernameAliases,
    firebaseUid: winner.firebaseUid || loser.firebaseUid || otherAuth || authUid,
    profileUid: winner.profileUid || loser.profileUid,
    ownerUid: winner.ownerUid || loser.ownerUid,
    shuffleFeatured: Boolean(winner.shuffleFeatured || loser.shuffleFeatured),
    shuffleSource:
      winner.shuffleFeatured || !loser.shuffleFeatured
        ? winner.shuffleSource || loser.shuffleSource
        : loser.shuffleSource || winner.shuffleSource,
  };
}

/**
 * Identity keys: session UID for anon_*; registered rows join by uid aliases
 * and by email/username only when there is hard identity evidence (authUid,
 * email, or multiple id tokens on the same row). Never join by photo/name
 * alone. Never join distinct anonymous sessions.
 */
export function shuffleProfileDedupeKeys(profile: {
  uid?: string;
  authUid?: string;
  id?: string;
  docId?: string;
  profileUid?: string;
  firebaseUid?: string;
  ownerUid?: string;
  aliasIds?: string[];
  username?: string;
  usernameLower?: string;
  usernameAliases?: string[];
  email?: string;
  photo?: string;
  fotos?: string[];
}) {
  const ids = collectShuffleIdTokens(profile);
  const anonIds = ids.filter((id) => isAnonShuffleSessionUid(id));
  if (anonIds.length > 0) {
    return anonIds.map((id) => `id:${id}`);
  }

  const keys = new Set<string>();
  for (const id of ids) keys.add(`id:${id}`);

  const email = canonicalEmailFrom(profile.email);
  if (email) keys.add(`e:${email}`);

  const usernames = usernameCanonicalCandidates(profile).filter(
    (username) => !isWeakJoinUsername(username),
  );
  if (hasHardIdentityEvidence(profile, ids) || email) {
    for (const username of usernames) keys.add(`u:${username}`);
  }

  if (keys.size === 0) {
    for (const username of usernames) keys.add(`u:${username}`);
  }

  return [...keys];
}

export function profileMatchesShuffleExcludeKeys(
  profile: {
    uid?: string;
    authUid?: string;
    username?: string;
    usernameLower?: string;
    email?: string;
    photo?: string;
    fotos?: string[];
    aliasIds?: string[];
    firebaseUid?: string;
  },
  excludeKeys: ReadonlySet<string>,
) {
  if (excludeKeys.size === 0) return false;

  const batchKeys = shuffleProfileBatchExcludeKeys(profile);
  if (batchKeys.some((key) => excludeKeys.has(key))) return true;

  return shuffleProfileDedupeKeys(profile).some((key) => excludeKeys.has(key));
}

/** Keys used only to remember recently shown profiles between shuffle clicks. */
export function shuffleProfileBatchExcludeKeys(profile: {
  uid?: string;
  authUid?: string;
  email?: string;
  aliasIds?: string[];
  firebaseUid?: string;
}) {
  const keys = new Set<string>();
  for (const id of collectShuffleIdTokens(profile)) {
    keys.add(`id:${id}`);
  }
  return [...keys];
}

export function shuffleProfilesShareIdentity(
  left: {
    uid?: string;
    username?: string;
    usernameLower?: string;
    email?: string;
    authUid?: string;
    aliasIds?: string[];
    firebaseUid?: string;
  },
  right: {
    uid?: string;
    username?: string;
    usernameLower?: string;
    email?: string;
    authUid?: string;
    aliasIds?: string[];
    firebaseUid?: string;
  },
) {
  const rightKeys = new Set(shuffleProfileDedupeKeys(right));
  return shuffleProfileDedupeKeys(left).some((key) => rightKeys.has(key));
}

export function buildShuffleDedupeProfileFromFirestoreUser(user: Record<string, unknown>) {
  const docId = String(user.id || "").trim();
  const firebaseUid = String(user.uid || user.firebaseUid || "").trim();
  const profileUid = String(user.profileUid || "").trim();
  const ownerUid = String(user.ownerUid || "").trim();
  const fotos = Array.isArray(user.fotos)
    ? user.fotos.map((value) => String(value || "")).filter(Boolean)
    : [];

  return {
    uid: docId || firebaseUid,
    authUid: firebaseUid || docId,
    firebaseUid: firebaseUid || undefined,
    profileUid: profileUid || undefined,
    ownerUid: ownerUid || undefined,
    aliasIds: uniqueStrings([docId, firebaseUid, profileUid, ownerUid]),
    username: String(user.username || user.nombre || user.usernameLower || ""),
    usernameLower: resolveUsernameLower({
      username: String(user.username || user.nombre || ""),
      usernameLower: String(user.usernameLower || ""),
    }),
    email: String(user.email || ""),
    photo: String(user.fotoPrincipal || user.photoURL || fotos[0] || ""),
    fotos,
  };
}

function createIdentityUnionFind() {
  const parent = new Map<string, string>();

  function find(key: string): string {
    const existing = parent.get(key);
    if (!existing) {
      parent.set(key, key);
      return key;
    }
    if (existing === key) return key;
    const root = find(existing);
    parent.set(key, root);
    return root;
  }

  function union(left: string, right: string) {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent.set(rootRight, rootLeft);
  }

  return { find, union };
}

/** Collapse duplicate shuffle rows by union-find over shared identity keys. */
export function dedupeShuffleProfiles<T extends DedupeableProfile>(
  profiles: T[],
): T[] {
  const { find, union } = createIdentityUnionFind();
  const indexed: Array<{ profile: T; keys: string[] }> = [];
  const orphans: T[] = [];

  for (const profile of profiles) {
    const keys = shuffleProfileDedupeKeys(profile);
    if (keys.length === 0) {
      orphans.push(profile);
      continue;
    }
    for (let index = 1; index < keys.length; index++) {
      union(keys[0], keys[index]);
    }
    indexed.push({ profile, keys });
  }

  const merged = new Map<string, T>();
  const order: string[] = [];

  for (const { profile, keys } of indexed) {
    const root = find(keys[0]);
    const existing = merged.get(root);
    if (!existing) {
      order.push(root);
      merged.set(root, mergeIdentityFields(profile, profile));
      continue;
    }
    const better = pickBetterProfile(existing, profile);
    const other = better === existing ? profile : existing;
    merged.set(root, mergeIdentityFields(better, other));
  }

  return [...order.map((key) => merged.get(key)!), ...orphans];
}

export function mergeShuffleProfileSnapshots<T extends DedupeableProfile>(
  ...groups: Array<T[] | undefined | null>
): T[] {
  const combined: T[] = [];
  for (const group of groups) {
    if (group && group.length > 0) combined.push(...group);
  }
  return dedupeShuffleProfiles(combined);
}

/** Full live snapshot over cache: overlay completeness, drop stale identities, O(n). */
export function overlayShuffleProfileSnapshots<T extends DedupeableProfile>(
  cached: T[] | undefined | null,
  live: T[] | undefined | null,
): T[] {
  if (!live?.length) return dedupeShuffleProfiles(cached || []);
  if (!cached?.length) return dedupeShuffleProfiles(live);
  const merged = dedupeShuffleProfiles([...cached, ...live]);
  const liveKeys = new Set<string>();
  for (const row of live) {
    for (const key of shuffleProfileDedupeKeys(row)) liveKeys.add(key);
  }
  const used = new Set<string>();
  const next: T[] = [];
  for (const row of merged) {
    const keys = shuffleProfileDedupeKeys(row);
    if (!keys.some((key) => liveKeys.has(key))) continue;
    const identity = shuffleProfileIdentityKey(row) || keys[0];
    if (used.has(identity)) continue;
    used.add(identity);
    next.push(row);
  }
  return next;
}

/** Keep one row per identity when building the visible shuffle window. */
export function uniqueShuffleWindow<T extends DedupeableProfile>(profiles: T[]): T[] {
  return dedupeShuffleProfiles(profiles);
}

export function assembleVisibleShuffleWindow<T extends DedupeableProfile>(input: {
  cache?: T[] | null;
  live?: T[] | null;
  featured?: T[] | null;
  pages?: Array<T[] | null | undefined>;
}): T[] {
  return uniqueShuffleWindow(
    mergeShuffleProfileSnapshots(
      input.cache,
      input.live,
      ...(input.pages || []),
      input.featured,
    ),
  );
}

export function assembleShuffleSlotProfiles<T extends DedupeableProfile>(
  featured: T[],
  pool: T[],
  indices: ArrayLike<number>,
  count: number,
): T[] {
  const picked: T[] = [];
  const n = Math.max(0, count);
  for (let i = 0; i < n; i++) {
    const profile = pool[indices[i]];
    if (profile) picked.push(profile);
  }
  return uniqueShuffleWindow([...featured, ...picked]);
}

export function describeShuffleIdentityDebug(profile: DedupeableProfile) {
  const keys = shuffleProfileDedupeKeys(profile);
  const identityKey = shuffleProfileIdentityKey(profile);
  const source =
    profile.shuffleSource === "cache" ||
    profile.shuffleSource === "live" ||
    profile.shuffleSource === "featured" ||
    profile.shuffleSource === "page"
      ? profile.shuffleSource
      : "unknown";
  return {
    canonicalHash: identityKey.startsWith("sid:")
      ? identityKey.slice(4)
      : hashIdentitySeed(identityKey),
    source,
    aliasCount: collectShuffleIdTokens(profile).length,
    keyCount: keys.length,
    featured: Boolean(profile.shuffleFeatured),
  };
}

/** Same display name, distinct proven identities — data migration, do not delete. */
export function findUnprovenShuffleNameCollisions<T extends DedupeableProfile>(
  profiles: T[],
) {
  const byName = new Map<string, Set<string>>();
  for (const profile of profiles) {
    const username = resolveUsernameLower(profile);
    if (!username || isWeakJoinUsername(username)) continue;
    const identity = shuffleProfileIdentityKey(profile);
    if (!identity) continue;
    const bucket = byName.get(username) || new Set<string>();
    bucket.add(identity);
    byName.set(username, bucket);
  }
  const collisions: Array<{ nameHash: string; identityCount: number }> = [];
  for (const [username, identities] of byName) {
    if (identities.size < 2) continue;
    collisions.push({
      nameHash: hashToken(username),
      identityCount: identities.size,
    });
  }
  return collisions;
}
