import type { FollowingProfile } from "@/hooks/useFollowingProfiles";

type FollowingSnapshot = {
  uid: string;
  profiles: FollowingProfile[];
  hasSession: boolean;
};

type AnonCardSnapshot = {
  show: boolean;
  isIncognitoVisitor: boolean;
  isProfileUser: boolean;
  searching: boolean;
};

let followingSnapshot: FollowingSnapshot | null = null;
let anonCardSnapshot: AnonCardSnapshot | null = null;

export function readCachedFollowingSnapshot(uid: string) {
  if (!uid || !followingSnapshot || followingSnapshot.uid !== uid) return null;
  return followingSnapshot;
}

export function writeCachedFollowingSnapshot(
  uid: string,
  profiles: FollowingProfile[],
  hasSession: boolean,
) {
  if (!uid) {
    followingSnapshot = null;
    return;
  }
  followingSnapshot = {
    uid,
    profiles: profiles.map((profile) => ({ ...profile })),
    hasSession,
  };
}

export function readCachedAnonCardSnapshot() {
  return anonCardSnapshot;
}

export function writeCachedAnonCardSnapshot(snapshot: AnonCardSnapshot) {
  anonCardSnapshot = { ...snapshot };
}
