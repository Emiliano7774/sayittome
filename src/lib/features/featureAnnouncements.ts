import { FEATURE_ANNOUNCEMENT_KEY } from "@/lib/boost/constants";

const PREFIX = "sayittome_feature_seen_";

export function hasSeenFeatureAnnouncement(featureKey = FEATURE_ANNOUNCEMENT_KEY) {
  if (typeof window === "undefined") return true;

  try {
    return localStorage.getItem(`${PREFIX}${featureKey}`) === "1";
  } catch {
    return true;
  }
}

export function markFeatureAnnouncementSeen(featureKey = FEATURE_ANNOUNCEMENT_KEY) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(`${PREFIX}${featureKey}`, "1");
  } catch {
    // ignore
  }
}
