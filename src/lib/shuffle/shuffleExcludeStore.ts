import { shuffleProfileBatchExcludeKeys } from "@/lib/shuffle/dedupeProfiles";

let excludeKeys = new Set<string>();
const listeners = new Set<() => void>();

function notifyExcludeListeners() {
  listeners.forEach((listener) => listener());
}

export function setShuffleExcludeProfiles(
  profiles: Array<{
    uid?: string;
    authUid?: string;
    username?: string;
    usernameLower?: string;
    email?: string;
    photo?: string;
  }>,
) {
  const next = new Set<string>();

  for (const profile of profiles) {
    for (const key of shuffleProfileBatchExcludeKeys(profile)) {
      next.add(key);
    }
  }

  if (next.size === excludeKeys.size) {
    let unchanged = true;
    for (const key of next) {
      if (!excludeKeys.has(key)) {
        unchanged = false;
        break;
      }
    }
    if (unchanged) return;
  }

  excludeKeys = next;
  notifyExcludeListeners();
}

export function getShuffleExcludeKeys() {
  return excludeKeys;
}

export function subscribeShuffleExclude(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
