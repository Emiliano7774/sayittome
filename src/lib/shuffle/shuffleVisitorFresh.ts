import { anonShuffleVisible } from "@/lib/anonMatch/anonymousPresenceIdentity";

type VisitorStamp = {
  shuffleVisitor?: boolean;
  presenceAt?: string;
  lastActive?: string;
};

/** Display an anon card for three hours after the LAST connection.
 * A card with a green indicator is historical discovery presence, not a
 * guarantee the old closed tab can still accept a DM. */
export function isShuffleVisitorFresh(profile: VisitorStamp, now = Date.now()) {
  if (profile.shuffleVisitor !== true) return true;
  const seen = Date.parse(String(profile.presenceAt || profile.lastActive || ""));
  return anonShuffleVisible(seen, now);
}
