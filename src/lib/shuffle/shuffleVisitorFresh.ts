import { ANON_MATCH_PRESENCE_FRESH_MS } from "@/lib/anonMatch/types";

type VisitorStamp = {
  shuffleVisitor?: boolean;
  presenceAt?: string;
  lastActive?: string;
};

/** Do not display a visitor after matching has stopped accepting their lease.
 * The presence document may retain a longer background recovery lease. */
export function isShuffleVisitorFresh(profile: VisitorStamp, now = Date.now()) {
  if (profile.shuffleVisitor !== true) return true;
  const seen = Date.parse(String(profile.presenceAt || profile.lastActive || ""));
  return Number.isFinite(seen) && seen <= now + 30_000 &&
    now - seen <= ANON_MATCH_PRESENCE_FRESH_MS;
}
