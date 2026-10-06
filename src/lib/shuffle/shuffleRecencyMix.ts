export const SHUFFLE_FRESH_MS = 24 * 60 * 60 * 1000;
export const SHUFFLE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Share of one window that may be live anonymous sessions. */
export const SHUFFLE_VISITOR_WINDOW_SHARE = 0.45;
/** People active in the last day, including live visitors, before the cap. */
export const SHUFFLE_FRESH_WINDOW_SHARE = 0.65;
export const SHUFFLE_WEEK_WINDOW_SHARE = 0.15;

export type ShuffleRecencyProfile = {
  uid?: string;
  authUid?: string;
  username?: string;
  usernameLower?: string;
  email?: string;
  photo?: string;
  fotos?: string[];
  aliasIds?: string[];
  firebaseUid?: string;
  lastActive?: string;
  presenceAt?: string;
  shuffleVisitor?: boolean;
};

export function shuffleActivityMs(profile: {
  presenceAt?: string;
  lastActive?: string;
}) {
  const stamp = String(profile.presenceAt || profile.lastActive || "").trim();
  if (!stamp) return 0;
  const ms = Date.parse(stamp);
  return Number.isFinite(ms) ? ms : 0;
}

export function shuffleRecencyBucket(
  profile: { presenceAt?: string; lastActive?: string; shuffleVisitor?: boolean },
  now: number,
): "fresh" | "week" | "older" {
  if (profile.shuffleVisitor) return "fresh";
  const ms = shuffleActivityMs(profile);
  if (!ms) return "older";
  const age = Math.max(0, now - ms);
  if (age <= SHUFFLE_FRESH_MS) return "fresh";
  if (age <= SHUFFLE_WEEK_MS) return "week";
  return "older";
}

function takeSample<T>(bucket: T[], count: number, random: () => number) {
  if (count <= 0 || bucket.length === 0) return [] as T[];
  const copy = bucket.slice();
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (copy.length - i));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy.slice(0, n);
}

function excluded<T extends ShuffleRecencyProfile>(
  profile: T,
  excludeKeys: ReadonlySet<string> | undefined,
) {
  if (!excludeKeys || excludeKeys.size === 0) return false;
  const ids = [
    profile.uid,
    profile.authUid,
    profile.firebaseUid,
    ...(profile.aliasIds || []),
  ];
  for (const id of ids) {
    const token = String(id || "").trim();
    if (token && excludeKeys.has(`id:${token}`)) return true;
  }
  const username = String(profile.usernameLower || profile.username || "")
    .trim()
    .toLowerCase();
  if (username && excludeKeys.has(`u:${username}`)) return true;
  return false;
}

/**
 * One shuffle window: mostly people active today, a slice from this week,
 * and a minority of older profiles so discovery does not disappear.
 * Live anonymous sessions sit inside the fresh slice and cannot take the
 * whole window while registered profiles still exist.
 * A short bucket is filled from the others. The window stays full whenever
 * the pool has enough people.
 */
export function mixShuffleWindow<T extends ShuffleRecencyProfile>(
  pool: T[],
  options: {
    now: number;
    windowSize: number;
    excludeKeys?: ReadonlySet<string>;
    /** Production passes the shuffle dedupe matcher. */
    isExcluded?: (profile: T) => boolean;
    strictExclude?: boolean;
    random?: () => number;
  },
): T[] {
  const windowSize = Math.max(0, Math.floor(options.windowSize) || 0);
  if (windowSize === 0 || pool.length === 0) return [];
  const random = options.random || Math.random;
  const now = options.now;

  const pick = (honorExclude: boolean) => {
    const visitors: T[] = [];
    const fresh: T[] = [];
    const week: T[] = [];
    const older: T[] = [];

    for (const profile of pool) {
      if (
        honorExclude &&
        (options.isExcluded
          ? options.isExcluded(profile)
          : excluded(profile, options.excludeKeys))
      ) {
        continue;
      }
      if (profile.shuffleVisitor) {
        visitors.push(profile);
        continue;
      }
      const bucket = shuffleRecencyBucket(profile, now);
      if (bucket === "fresh") fresh.push(profile);
      else if (bucket === "week") week.push(profile);
      else older.push(profile);
    }

    const available = visitors.length + fresh.length + week.length + older.length;
    const target = Math.min(windowSize, available);
    if (target === 0) return [] as T[];

    const registered = fresh.length + week.length + older.length;
    let olderN = Math.min(older.length, Math.round(target * (1 - SHUFFLE_FRESH_WINDOW_SHARE - SHUFFLE_WEEK_WINDOW_SHARE)));
    let weekN = Math.min(week.length, Math.round(target * SHUFFLE_WEEK_WINDOW_SHARE));
    let freshN = Math.max(0, target - olderN - weekN);

    let visitorN = Math.min(
      visitors.length,
      freshN,
      Math.round(target * SHUFFLE_VISITOR_WINDOW_SHARE),
    );
    if (registered === 0) {
      visitorN = Math.min(visitors.length, target);
      freshN = visitorN;
      weekN = 0;
      olderN = 0;
    }

    const pickedVisitors = takeSample(visitors, visitorN, random);
    const pickedFresh = takeSample(fresh, Math.max(0, freshN - pickedVisitors.length), random);
    const pickedWeek = takeSample(week, weekN, random);
    const pickedOlder = takeSample(older, olderN, random);
    const picked = [...pickedVisitors, ...pickedFresh, ...pickedWeek, ...pickedOlder];
    const used = new Set(picked);

    const rest = [...fresh, ...week, ...older, ...visitors].filter((profile) => !used.has(profile));
    for (const profile of takeSample(
      rest.filter((profile) => !profile.shuffleVisitor),
      rest.length,
      random,
    )) {
      if (picked.length >= target) break;
      used.add(profile);
      picked.push(profile);
    }
    if (picked.length < target) {
      for (const profile of takeSample(
        rest.filter((profile) => profile.shuffleVisitor && !used.has(profile)),
        rest.length,
        random,
      )) {
        if (picked.length >= target) break;
        used.add(profile);
        picked.push(profile);
      }
    }
    return picked;
  };

  const preferred = pick(true);
  if (
    options.strictExclude ||
    !options.excludeKeys ||
    options.excludeKeys.size === 0 ||
    preferred.length >= Math.min(windowSize, pool.length)
  ) {
    return preferred.slice(0, windowSize);
  }

  const used = new Set(preferred);
  const extra = pick(false).filter((profile) => !used.has(profile));
  return [...preferred, ...extra].slice(0, windowSize);
}

/**
 * Keep the painted window. Drop anonymous sessions that left, refill those
 * seats with people who just connected, and on a window that has no live
 * visitors yet replace the stalest profiles up to the visitor cap.
 */
export function planLiveVisitorSlots<T extends ShuffleRecencyProfile>(
  visible: T[],
  visitors: T[],
  windowSize: number,
  now: number,
): T[] {
  const size = Math.max(0, Math.floor(windowSize) || 0);
  if (size === 0) return [];
  const live = new Map<string, T>();
  for (const visitor of visitors) {
    const uid = String(visitor.uid || "").trim();
    if (!uid || !visitor.shuffleVisitor) continue;
    live.set(uid, visitor);
  }

  const kept: T[] = [];
  const seen = new Set<string>();
  for (const row of visible) {
    if (kept.length >= size) break;
    const uid = String(row.uid || "").trim();
    if (row.shuffleVisitor) {
      if (!uid || !live.has(uid) || seen.has(uid)) continue;
      seen.add(uid);
      kept.push(live.get(uid) as T);
      continue;
    }
    if (uid && seen.has(uid)) continue;
    if (uid) seen.add(uid);
    kept.push(row);
  }

  const newcomers = [...live.values()].filter((visitor) => {
    const uid = String(visitor.uid || "").trim();
    return uid && !seen.has(uid);
  });
  const previousVisitors = visible.filter((row) => row.shuffleVisitor).length;
  const keptVisitors = kept.filter((row) => row.shuffleVisitor).length;
  const cap = Math.max(1, Math.round(size * SHUFFLE_VISITOR_WINDOW_SHARE));

  // Empty painted window (common with solo-online after prune): seed live anons.
  // Previously holes=0 blocked every newcomer when previousVisitors was also 0.
  if (kept.length === 0 && newcomers.length > 0) {
    return newcomers.slice(0, size);
  }

  if (keptVisitors === 0 && newcomers.length > 0 && kept.length > 0) {
    const stale = kept
      .map((row, index) => ({ index, ms: Math.min(shuffleActivityMs(row), now) }))
      .filter((item) => !kept[item.index]?.shuffleVisitor)
      .sort((a, b) => a.ms - b.ms);
    let placed = 0;
    const next = kept.slice();
    for (const item of stale) {
      if (placed >= cap || placed >= newcomers.length) break;
      const visitor = newcomers[placed];
      const uid = String(visitor.uid || "").trim();
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      next[item.index] = visitor;
      placed += 1;
    }
    return next.slice(0, size);
  }

  const holes = Math.max(0, previousVisitors - keptVisitors);
  // Also fill free seats (solo-online often has room after profiles drop out).
  const freeSeats = Math.max(0, size - kept.length);
  const budget = Math.max(holes, Math.min(freeSeats, cap - keptVisitors));
  let placed = 0;
  for (const visitor of newcomers) {
    if (placed >= budget || kept.length >= size) break;
    const uid = String(visitor.uid || "").trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    kept.push(visitor);
    placed += 1;
  }
  return kept.slice(0, size);
}
