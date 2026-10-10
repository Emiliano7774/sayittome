import { signOut } from "firebase/auth";

import {
  isIncompleteAuthDestination,
  resolvePostAuthPath,
} from "@/lib/auth/postAuthRedirect";
import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
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

function openAnonMatchDoorLocally() {
  setShuffleLegalAcceptance();
  // Fresh local match filters — prior reject/DND must not block the new door.
  clearRejectedSolicitanteKeys();
  clearDismissedRequestIds();
  writeLocalAnonMatchDndUntil("");
  notifyAnonMatchDoorChanged();
}

/**
 * Enter anonymous shuffle mode with a clean session.
 * Incomplete registrations are signed out so profile setup cannot be skipped.
 * Always opens the anon-match door, but keeps the existing match alias for
 * this Firebase anonymous session. Returning to Shuffle is not a logout and
 * must never change who an active anonymous visitor is.
 *
 * Each anonymous tab gets its own Firebase uid (session persistence) so two
 * anonymous windows in the same browser can match each other.
 */
export async function enterAnonymousMode() {
  const user = auth.currentUser;

  if (user && !user.isAnonymous) {
    const next = await resolvePostAuthPath(user.uid, user.emailVerified);

    if (isIncompleteAuthDestination(next)) {
      await deleteCurrentDeviceFcmToken(user.uid);
      await signOut(auth);
      beginFreshAnonSession();
    } else {
      // Complete registered profile keeps durable Auth and matches as perfil.
      openAnonMatchDoorLocally();
      return;
    }
  }

  // Claims a tab-local anonymous uid when this browser inherited a shared one,
  // so sibling anonymous tabs are different people for match.
  await ensureStorageAuth({ allowAnonymous: true }).catch(() => null);

  openAnonMatchDoorLocally();

  try {
    const { resolveAnonMatchSessionId } = await import("@/lib/anonMatch/fetchAnonMatch");
    // Re-enter /shuffle without issuing a new identity. The server bind is
    // idempotent for the same Firebase uid, even after a page reload.
    await resolveAnonMatchSessionId();
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
