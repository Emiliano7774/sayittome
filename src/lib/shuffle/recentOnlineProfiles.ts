import {
  dedupeShuffleProfiles,
  shuffleProfilesShareIdentity,
} from "@/lib/shuffle/dedupeProfiles";

/**
 * Reconcile fresh registered-presence snapshots with the durable Shuffle pool.
 * Firestore's ten-minute public-profile cache must not make recent logins look
 * offline. Preserve stable card IDs and never remove older/general profiles.
 *
 * Shared by SSR (initial load) and the already-existing visitors poll (web).
 * No new client polling, and no changes to anonymous three-hour membership.
 */
export function mergeRecentOnlineProfiles<T extends {
  uid: string;
  username: string;
  authUid?: string;
  firebaseUid?: string;
  aliasIds?: string[];
  presenceAt?: string;
  lastActive?: string;
  onlineUntilAt?: string;
  shuffleVisitor?: boolean;
  mostrarUltimaVez?: boolean;
  showOnline?: boolean;
  shuffleFeatured?: boolean;
}>(pool: T[], recent: T[]): T[] {
  if (recent.length === 0) return pool;
  const consumed = new Set<number>();
  const overlaid = pool.map((old) => {
    if (old.shuffleVisitor === true) return old;
    const index = recent.findIndex(
      (next) => next.shuffleVisitor !== true && shuffleProfilesShareIdentity(old, next),
    );
    if (index < 0) return old;
    consumed.add(index);
    const fresh = recent[index];
    return {
      ...old,
      ...fresh,
      uid: old.uid,
      authUid: old.authUid || fresh.authUid,
      aliasIds: [...new Set([...(old.aliasIds || []), ...(fresh.aliasIds || [])])],
      shuffleFeatured: Boolean(old.shuffleFeatured || fresh.shuffleFeatured),
      // The newer heartbeat is authoritative, even if the old cache won a
      // photo/biography quality tie in a prior identity reconciliation.
      presenceAt: fresh.presenceAt,
      lastActive: fresh.lastActive,
      onlineUntilAt: fresh.onlineUntilAt,
      showOnline: fresh.showOnline,
    };
  });
  for (let index = 0; index < recent.length; index++) {
    if (!consumed.has(index)) overlaid.push(recent[index]);
  }
  return dedupeShuffleProfiles(overlaid);
}
