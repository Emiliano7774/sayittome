import { collectShuffleIdTokens } from "@/lib/shuffle/dedupeProfiles";

/** Firestore/doc uid used by follow, stories, exclude, navigation. Not the visual React key. */
export function shuffleProfileActionUid(profile: { uid?: string }) {
  return String(profile.uid || "").trim();
}

export function storyOwnerUidFromShuffleCard(profile: { uid?: string }) {
  return shuffleProfileActionUid(profile);
}

export function followTargetUidFromShuffleCard(profile: { uid?: string }) {
  return shuffleProfileActionUid(profile);
}

export function shuffleProfileMatchesBoostUid(
  profile: Record<string, unknown> | { uid?: string; aliasIds?: string[] },
  boostUid: string,
) {
  const needle = String(boostUid || "").trim();
  if (!needle) return false;
  return collectShuffleIdTokens(profile).includes(needle);
}

/** Card → FollowButton / stories / boost: same actionable uid, aliases only for lookup. */
export function shuffleCardActionTargets(profile: {
  uid?: string;
  aliasIds?: string[];
  authUid?: string;
  firebaseUid?: string;
}) {
  const actionUid = shuffleProfileActionUid(profile);
  return {
    followTargetUid: actionUid,
    storyOwnerUid: actionUid,
    boostLookupUids: collectShuffleIdTokens(profile),
  };
}
