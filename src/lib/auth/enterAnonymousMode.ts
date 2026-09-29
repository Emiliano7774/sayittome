import { signInAnonymously, signOut } from "firebase/auth";

import {
  isIncompleteAuthDestination,
  resolvePostAuthPath,
} from "@/lib/auth/postAuthRedirect";
import { useAnonymousTabPersistence } from "@/lib/auth/authPersistence";
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
 * Always opens the anon-match door and rotates the match alias so re-entry
 * is discoverable again (same browser must not reuse a stale match identity).
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

  // Isolate this tab's anonymous Auth from sibling tabs/windows. Default
  // IndexedDB persistence shares one anonymous uid across the whole browser.
  await useAnonymousTabPersistence();
  if (auth.currentUser?.isAnonymous) {
    await signOut(auth).catch(() => null);
  }
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }

  openAnonMatchDoorLocally();

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
