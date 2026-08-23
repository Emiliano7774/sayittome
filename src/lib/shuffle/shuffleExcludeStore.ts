import { shuffleProfileBatchExcludeKeys } from "@/lib/shuffle/dedupeProfiles";

let excludeKeys = new Set<string>();
let excludeProfiles: Array<{
  uid?: string;
  authUid?: string;
  username?: string;
  usernameLower?: string;
  email?: string;
  photo?: string;
  aliasIds?: string[];
  firebaseUid?: string;
}> = [];
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
    aliasIds?: string[];
    firebaseUid?: string;
  }>,
) {
  const next = new Set<string>();

  for (const profile of profiles) {
    for (const key of shuffleProfileBatchExcludeKeys(profile)) {
      next.add(key);
    }
  }

  const prevProfiles = excludeProfiles;
  const keysUnchanged =
    next.size === excludeKeys.size && [...next].every((key) => excludeKeys.has(key));
  const identityChanged =
    prevProfiles.length !== profiles.length ||
    profiles.some((profile, index) => {
      const prev = prevProfiles[index];
      return (
        String(profile.uid || "") !== String(prev?.uid || "") ||
        String(profile.authUid || "") !== String(prev?.authUid || "")
      );
    });
  excludeProfiles = profiles.slice();
  excludeKeys = next;
  if (keysUnchanged && !identityChanged) return;
  notifyExcludeListeners();
}

export function getShuffleExcludeProfiles() {
  return excludeProfiles;
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
