/**
 * Visual capture frame identity — tooling only.
 * Do not dedupe solely by CDP/presented timestamps.
 */

export const CAPTURE_PROVIDER_CDP_SCREENCAST_VISUAL = "CDP_SCREENCAST_VISUAL_SPOT_CHECK";
export const CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST =
  "CDP_SCREENCAST_VISUAL_SPOT_CHECK_ROBUST_IDENTITY";
export const CAPTURE_PROVIDER_SCREENSHOT_BURST = "VISUAL_SCREENSHOT_BURST_PROVIDER";

export const VISUAL_CAPTURE_PROVIDER_ORDER = [
  CAPTURE_PROVIDER_SCREENSHOT_BURST,
  CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST,
  CAPTURE_PROVIDER_CDP_SCREENCAST_VISUAL,
];

export function frameOrderKey(f) {
  if (typeof f?.receiveMonoMs === "number") return f.receiveMonoMs;
  if (typeof f?.framePresentedAtMono === "number") return f.framePresentedAtMono;
  if (typeof f?.deltaFromPointerMs === "number") return f.deltaFromPointerMs;
  if (typeof f?.index === "number") return f.index;
  if (typeof f?.frameId === "number") return f.frameId;
  return 0;
}

export function frameIdentityKey(f) {
  if (f?.bufferHash) return `h:${f.bufferHash}`;
  if (f?.frameId != null) return `id:${f.frameId}`;
  if (f?.receiveMonoMs != null && f?.index != null) return `r:${f.receiveMonoMs}:${f.index}`;
  if (f?.index != null) return `i:${f.index}`;
  return `m:${f?.framePresentedAtMono ?? "x"}`;
}

/**
 * Retain same-timestamp frames when image hash / sequence identity differs.
 * Only drop true duplicates (identical hash, or identical identity with no hash).
 */
export function dedupeVisualFrames(frames) {
  const seen = new Set();
  const out = [];
  const ordered = [...(frames ?? [])].sort((a, b) => {
    const d = frameOrderKey(a) - frameOrderKey(b);
    if (d !== 0) return d;
    return (a.index ?? a.frameId ?? 0) - (b.index ?? b.frameId ?? 0);
  });
  for (const f of ordered) {
    const key = frameIdentityKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function detectTimestampCollapse(frames) {
  const byMono = new Map();
  for (const f of frames ?? []) {
    const m = f.framePresentedAtMono;
    if (m == null) continue;
    if (!byMono.has(m)) byMono.set(m, []);
    byMono.get(m).push(f);
  }
  let collapseGroups = 0;
  let sameTsDistinctFrames = 0;
  for (const group of byMono.values()) {
    if (group.length < 2) continue;
    const hashes = new Set(group.map((x) => x.bufferHash).filter(Boolean));
    const ids = new Set(group.map((x) => x.frameId ?? x.index).filter((x) => x != null));
    if (hashes.size > 1 || ids.size > 1) {
      collapseGroups += 1;
      sameTsDistinctFrames += Math.max(hashes.size, ids.size);
    }
  }
  return {
    VISUAL_CDP_TIMESTAMP_COLLAPSE_DETECTED: collapseGroups > 0,
    collapseGroups,
    sameTsDistinctFrames,
    VISUAL_SAME_TIMESTAMP_DISTINCT_FRAME_ACCEPTED: collapseGroups > 0,
  };
}

export function uniqueIdentityCount(frames) {
  return new Set((frames ?? []).map(frameIdentityKey)).size;
}

export function uniquePresentedMonoCount(frames) {
  return new Set(
    (frames ?? []).map((f) => f.framePresentedAtMono).filter((m) => m != null),
  ).size;
}

export function selectVisualCaptureProvider({
  preferred = CAPTURE_PROVIDER_SCREENSHOT_BURST,
  screencastFrames = [],
  burstFrames = [],
  minActiveIdentities = 2,
  activeScreencast = [],
  activeBurst = [],
} = {}) {
  const screencastCollapse = detectTimestampCollapse(screencastFrames);
  const burstIds = uniqueIdentityCount(activeBurst);
  const screencastIds = uniqueIdentityCount(activeScreencast);

  const burstReliable = burstIds >= minActiveIdentities;
  const screencastReliable = screencastIds >= minActiveIdentities;

  let selected = preferred;
  let fallback = null;

  // Prefer the provider with reliable active identities; screencast robust beats
  // collapsed-timestamp uniqueness because identity dedupe retains distinct hashes.
  if (burstReliable && screencastReliable) {
    selected =
      screencastIds >= burstIds
        ? CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST
        : CAPTURE_PROVIDER_SCREENSHOT_BURST;
    fallback =
      selected === CAPTURE_PROVIDER_SCREENSHOT_BURST
        ? CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST
        : CAPTURE_PROVIDER_SCREENSHOT_BURST;
  } else if (screencastReliable) {
    selected = CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST;
    if (preferred === CAPTURE_PROVIDER_SCREENSHOT_BURST) {
      fallback = CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST;
    }
  } else if (burstReliable) {
    selected = CAPTURE_PROVIDER_SCREENSHOT_BURST;
    if (preferred !== CAPTURE_PROVIDER_SCREENSHOT_BURST) {
      fallback = CAPTURE_PROVIDER_SCREENSHOT_BURST;
    }
  } else if (preferred === CAPTURE_PROVIDER_SCREENSHOT_BURST) {
    selected = CAPTURE_PROVIDER_SCREENSHOT_BURST;
  } else {
    selected = CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST;
  }

  return {
    VISUAL_CAPTURE_PROVIDER_SELECTED: selected,
    VISUAL_CAPTURE_PROVIDER_FALLBACK_SELECTED: fallback,
    VISUAL_PROVIDER_RELIABLE_ACTIVE_FRAMES: burstReliable || screencastReliable,
    VISUAL_PROVIDER_INSUFFICIENT_ACTIVE_FRAMES: !burstReliable && !screencastReliable,
    screencastCollapse,
    burstActiveIdentities: burstIds,
    screencastActiveIdentities: screencastIds,
  };
}
