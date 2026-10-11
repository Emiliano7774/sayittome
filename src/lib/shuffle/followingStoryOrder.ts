import type { FollowingProfile } from "@/lib/shuffle/followingTypes";
import type { StoryUserGroup } from "@/lib/stories/types";

const STORY_AGE_MS = 24 * 60 * 60_000;

export type FollowingStoryStatus = {
  latestStoryAtMs: number;
  hasUnseen: boolean;
};

/** Story data is already loaded and cached for Shuffle; this join performs
 * no Firestore queries. Old/expired entries must not outrank ordinary follows. */
export function followingStoryStatus(
  profile: FollowingProfile,
  groups: ReadonlyArray<StoryUserGroup>,
  nowMs = Date.now(),
): FollowingStoryStatus {
  const ids = new Set([profile.uid, profile.authUid, ...(profile.aliasIds || [])].filter(Boolean));
  const username = String(profile.username || "").trim().toLowerCase();
  let latestStoryAtMs = 0;
  let hasUnseen = false;
  for (const group of groups) {
    if (group.isAnonymousStory) continue;
    const sameOwner = ids.has(group.ownerUid) ||
      (Boolean(username) && String(group.ownerUsername || "").trim().toLowerCase() === username);
    if (!sameOwner) continue;
    for (const story of group.stories) {
      if (story.adminDeleted) continue;
      const createdAt = Number(story.createdAtMs) || 0;
      const expiresAt = Number(story.expiresAtMs) || (createdAt ? createdAt + STORY_AGE_MS : 0);
      if (!createdAt || createdAt > nowMs || expiresAt <= nowMs) continue;
      if (createdAt > latestStoryAtMs) latestStoryAtMs = createdAt;
    }
    if (latestStoryAtMs) hasUnseen = hasUnseen || group.hasUnseen;
  }
  return { latestStoryAtMs, hasUnseen };
}

/** Active story owners first (newest story first); others most recently followed
 * first. Tie-breaks preserve server snapshot order. */
export function orderFollowingProfiles(
  profiles: ReadonlyArray<FollowingProfile>,
  groups: ReadonlyArray<StoryUserGroup>,
  nowMs = Date.now(),
): FollowingProfile[] {
  const status = new Map<string, FollowingStoryStatus>();
  const storyFor = (profile: FollowingProfile) => {
    const key = profile.uid;
    let result = status.get(key);
    if (!result) {
      result = followingStoryStatus(profile, groups, nowMs);
      status.set(key, result);
    }
    return result;
  };
  return profiles
    .map((profile, index) => ({ profile, index }))
    .sort((a, b) => {
      const aStory = storyFor(a.profile).latestStoryAtMs;
      const bStory = storyFor(b.profile).latestStoryAtMs;
      if (aStory !== bStory) return bStory - aStory;
      const aFollow = Number(a.profile.followedAtMs) || 0;
      const bFollow = Number(b.profile.followedAtMs) || 0;
      if (aFollow !== bFollow) return bFollow - aFollow;
      return a.index - b.index;
    })
    .map(({ profile }) => profile);
}
