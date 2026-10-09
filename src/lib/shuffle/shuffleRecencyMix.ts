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
    // Every live visitor fits in the initial 35-card window when there are
    // <=35. Only when anons exceed physical capacity keep the original
    // registered-discovery share; later arrivals rotate through live seats.
    const visitorN = Math.min(
      visitors.length,
      visitors.length <= target
        ? target
        : registered === 0
          ? target
          : Math.max(1, Math.round(target * SHUFFLE_VISITOR_WINDOW_SHARE)),
    );
    const registeredSeats = target - visitorN;
    const olderN = Math.min(older.length, Math.round(registeredSeats * (1 - SHUFFLE_FRESH_WINDOW_SHARE - SHUFFLE_WEEK_WINDOW_SHARE)));
    const weekN = Math.min(week.length, Math.round(registeredSeats * SHUFFLE_WEEK_WINDOW_SHARE));
    const freshN = Math.max(0, registeredSeats - olderN - weekN);

    const pickedVisitors = takeSample(visitors, visitorN, random);
    const pickedFresh = takeSample(fresh, freshN, random);
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
    // Live anons are interleaved randomly with registered people, never
    // shown as a contiguous list at the start of the window.
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
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
 * Update the 35 cards in place while keeping each eligible anonymous
 * visitor visible whenever the set fits in the window. No 45% anon cap:
 * that cap silently hid legitimate new users even while the API returned them.
 * New arrivals replace randomly scattered registered cards rather than form
 * a block at the front/end. Identical polls never reshuffle existing cards.
 * When there are >35 anons (physically impossible to display simultaneously),
 * new arrivals rotate an existing anon seat; do not duplicate identities.
 */
export function planLiveVisitorSlots<T extends ShuffleRecencyProfile>(
  visible: T[],
  visitors: T[],
  windowSize: number,
  now: number,
  options?: {
    preferVisitors?: boolean;
    random?: () => number;
    newVisitorIds?: ReadonlySet<string>;
    fillers?: T[];
  },
): T[] {
  void now;
  void options?.preferVisitors;
  const size = Math.max(0, Math.floor(windowSize) || 0);
  if (!size) return [];
  const random = options?.random || Math.random;
  const live = new Map<string, T>();
  for (const visitor of visitors) {
    const uid = String(visitor.uid || "").trim();
    if (uid && visitor.shuffleVisitor) live.set(uid, visitor);
  }

  const kept: T[] = [];
  const present = new Set<string>();
  for (const row of visible) {
    if (kept.length >= size) break;
    const uid = String(row.uid || "").trim();
    if (!uid || present.has(uid)) continue;
    if (row.shuffleVisitor) {
      if (!live.has(uid)) continue;
      kept.push(live.get(uid) as T);
    } else {
      kept.push(row);
    }
    present.add(uid);
  }

  const fillVacantSeats = () => {
    if (kept.length >= size || !options?.fillers?.length) return kept;
    const candidates = options.fillers.filter((row) => {
      const uid = String(row.uid || "").trim();
      return uid && !row.shuffleVisitor && !present.has(uid);
    });
    while (kept.length < size && candidates.length > 0) {
      const pick = Math.floor(random() * candidates.length);
      const [candidate] = candidates.splice(pick, 1);
      const uid = String(candidate.uid || "").trim();
      if (!uid || present.has(uid)) continue;
      kept.splice(Math.floor(random() * (kept.length + 1)), 0, candidate);
      present.add(uid);
    }
    return kept;
  };

  // When >35 anons exist, only the newly arrived may rotate a seat.
  // Repeating the same poll must NOT rotate the 10 currently offscreen users
  // every 12 seconds (visible churn / unnecessary DOM updates).
  const newcomers = [...live.values()].filter((row) => {
    const uid = String(row.uid || "").trim();
    return !present.has(uid) && (
      live.size <= size || !options?.newVisitorIds || options.newVisitorIds.has(uid)
    );
  });
  if (!newcomers.length) return fillVacantSeats();

  for (const visitor of newcomers) {
    const uid = String(visitor.uid || "").trim();
    if (!uid || present.has(uid)) continue;
    if (kept.length < size) {
      // Place into a random gap in the displayed sequence, not an anon list.
      const at = Math.floor(random() * (kept.length + 1));
      kept.splice(at, 0, visitor);
    } else {
      const registeredSeats: number[] = [];
      for (let i = 0; i < kept.length; i++) {
        if (!kept[i].shuffleVisitor) registeredSeats.push(i);
      }
      // Crowded (>35) pools cannot display everyone simultaneously. Keep
      // some registered cards interleaved instead of filling all seats with
      // anonymous visitors; newcomers rotate anonymous seats past this point.
      const overcrowded = live.size > size;
      const anonCount = kept.filter((row) => row.shuffleVisitor).length;
      const mixedAnonCeiling = Math.max(1, Math.round(size * 0.7));
      const canReplaceRegistered =
        !overcrowded || anonCount < mixedAnonCeiling;
      const anonSeats = kept.flatMap((row, i) => row.shuffleVisitor ? [i] : []);
      const choices = canReplaceRegistered && registeredSeats.length
        ? registeredSeats
        : overcrowded
          ? anonSeats
          : [];
      if (!choices.length) continue;
      const at = choices[Math.floor(random() * choices.length)];
      const evictedId = String(kept[at].uid || "").trim();
      if (evictedId) present.delete(evictedId);
      kept[at] = visitor;
    }
    present.add(uid);
  }
  return fillVacantSeats().slice(0, size);
}
