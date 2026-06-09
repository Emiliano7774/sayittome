import type { User } from "firebase/auth";

import { isPublicProfile } from "@/lib/profile/isPublicProfile";

export type BoostAccessState = "loading" | "guest" | "incomplete_profile" | "ready";

type ProfileLike = {
  username?: string;
  provincia?: string;
  profileSetupComplete?: boolean;
  uid?: string;
} | null;

export function resolveBoostAccessState(
  firebaseUser: User | null,
  profile: ProfileLike,
  authLoading: boolean,
  profileRecord?: Record<string, unknown> | null,
): BoostAccessState {
  if (authLoading) return "loading";

  if (!firebaseUser || firebaseUser.isAnonymous) {
    return "guest";
  }

  if (profileRecord) {
    return isPublicProfile(profileRecord) ? "ready" : "incomplete_profile";
  }

  const username = String(profile?.username || "").trim();
  const provincia = String(profile?.provincia || "").trim();
  const setupComplete = profile?.profileSetupComplete === true;

  if (!username || !provincia || !setupComplete) {
    return "incomplete_profile";
  }

  return "ready";
}

export function boostCacheKey(uid: string) {
  return `boost_status_v1_${uid}`;
}
