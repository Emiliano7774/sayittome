import { signOut } from "firebase/auth";

import {
  isIncompleteAuthDestination,
  resolvePostAuthPath,
} from "@/lib/auth/postAuthRedirect";
import { beginFreshAnonSession } from "@/lib/chat/anonSession";
import { deleteCurrentDeviceFcmToken } from "@/lib/chat/fcmPush";
import { auth } from "@/lib/firebase";
import { setShuffleLegalAcceptance } from "@/lib/legal/shuffleTerms";
import { notifyAnonMatchDoorChanged } from "@/lib/anonMatch/anonMatchDoor";
import {
  clearDismissedRequestIds,
  clearRejectedSolicitanteKeys,
} from "@/lib/anonMatch/dismissedIncoming";
import { writeLocalAnonMatchDndUntil } from "@/lib/anonMatch/doNotDisturb";

/**
 * Enter anonymous shuffle mode with a clean session.
 * Incomplete registrations are signed out so profile setup cannot be skipped.
 * Always opens the anon-match door and rotates the match alias so re-entry
 * is discoverable again (same browser must not reuse a stale match identity).
 */
export async function enterAnonymousMode() {
  const user = auth.currentUser;

  if (user) {
    const next = await resolvePostAuthPath(user.uid, user.emailVerified);

    if (isIncompleteAuthDestination(next)) {
      await deleteCurrentDeviceFcmToken(user.uid);
      await signOut(auth);
      beginFreshAnonSession();
    }
  }

  setShuffleLegalAcceptance();
  // Fresh local match filters — prior reject/DND must not block the new door.
  clearRejectedSolicitanteKeys();
  clearDismissedRequestIds();
  writeLocalAnonMatchDndUntil("");
  notifyAnonMatchDoorChanged();

  try {
    const { resolveAnonMatchSessionId } = await import("@/lib/anonMatch/fetchAnonMatch");
    await resolveAnonMatchSessionId({ rotate: true });
    await import("@/services/anonymousPresence").then((mod) =>
      mod.bumpAnonymousPresenceForMatch(),
    );
  } catch {
    // Presence/bind is best-effort; door is already open for listeners.
  }
}

export async function hasCompleteRegisteredProfile(uid: string, emailVerified: boolean) {
  const next = await resolvePostAuthPath(uid, emailVerified);
  return !isIncompleteAuthDestination(next);
}
