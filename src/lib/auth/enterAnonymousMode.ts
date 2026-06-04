import { signOut } from "firebase/auth";

import { resolvePostAuthPath } from "@/lib/auth/postAuthRedirect";
import { beginFreshAnonSession } from "@/lib/chat/anonSession";
import { auth } from "@/lib/firebase";
import { setShuffleLegalAcceptance } from "@/lib/legal/shuffleTerms";

/**
 * Enter anonymous shuffle mode with a clean session.
 * Incomplete registrations are signed out so profile setup cannot be skipped.
 */
export async function enterAnonymousMode() {
  const user = auth.currentUser;

  if (user) {
    const next = await resolvePostAuthPath(user.uid, user.emailVerified);

    if (next !== "/settings") {
      await signOut(auth);
      beginFreshAnonSession();
    }
  }

  setShuffleLegalAcceptance();
}

export async function hasCompleteRegisteredProfile(uid: string, emailVerified: boolean) {
  const next = await resolvePostAuthPath(uid, emailVerified);
  return next === "/settings";
}
