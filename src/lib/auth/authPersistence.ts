import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInAnonymously,
  signOut,
  type User,
} from "firebase/auth";

import { auth } from "@/lib/firebase";
import { isNativeAppShell } from "@/lib/app/nativeShell";

/** Anonymous uid this tab already claimed as its own. */
const TAB_ANON_CLAIM_KEY = "sayittome:auth:tab-anon-uid:v1";

function readTabAnonClaim() {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(TAB_ANON_CLAIM_KEY) || "";
  } catch {
    return "";
  }
}

export function writeTabAnonClaim(uid: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TAB_ANON_CLAIM_KEY, String(uid || ""));
  } catch {
    // Ignore quota / privacy mode.
  }
}

/**
 * Firebase's session persistence is independent of our tab-claim marker.
 * If only that marker was lost, the existing Auth uid still belongs to this
 * tab: do not sign out and create a completely different anonymous visitor.
 * A uid inherited from browserLocalPersistence has no tab-local Auth record.
 */
function hasTabLocalFirebaseAuthUid(uid: string) {
  if (typeof window === "undefined" || !uid) return false;
  try {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i) || "";
      if (!key.startsWith("firebase:authUser:")) continue;
      const record = JSON.parse(sessionStorage.getItem(key) || "null") as {
        uid?: string;
      } | null;
      if (record?.uid === uid) return true;
    }
  } catch {
    // Storage unavailable: fall back to normal cross-tab isolation.
  }
  return false;
}

/**
 * Tab-local auth for anonymous visitors.
 * Default IndexedDB persistence shares one anonymous uid across all tabs of
 * the same browser profile, so two "anonymous" tabs cannot match each other.
 * Session persistence keeps Auth state per tab and does not sync across tabs.
 */
export async function useAnonymousTabPersistence() {
  await setPersistence(auth, browserSessionPersistence);
}

/**
 * Durable auth for registered login/register — survives reload and other tabs.
 */
export async function useRegisteredAuthPersistence() {
  await setPersistence(auth, browserLocalPersistence);
}

let anonymousAdoptionPromise: Promise<User> | null = null;

/** Other auth consumers must not sign in while an inherited uid is being split. */
export async function waitForAnonymousAdoption() {
  if (anonymousAdoptionPromise) await anonymousAdoptionPromise;
}

/**
 * Replace an anonymous uid inherited from shared browser storage with one this
 * tab owns. Recover a missing marker for a genuinely tab-local/native session
 * rather than churning its uid. Concurrent consumers share one adoption.
 */
export async function adoptTabLocalAnonymousAuth(current: User): Promise<User> {
  if (!current.isAnonymous) return current;
  if (readTabAnonClaim() === current.uid) return current;

  // Native WebView has a single app session, and browserSessionPersistence
  // already isolates an existing uid. Neither case is a new anonymous login.
  if (isNativeAppShell() || hasTabLocalFirebaseAuthUid(current.uid)) {
    writeTabAnonClaim(current.uid);
    return current;
  }

  if (!anonymousAdoptionPromise) {
    anonymousAdoptionPromise = (async () => {
      if (auth.currentUser?.uid !== current.uid && auth.currentUser) {
        return auth.currentUser;
      }
      await useAnonymousTabPersistence();
      if (auth.currentUser?.uid !== current.uid && auth.currentUser) {
        return auth.currentUser;
      }
      await signOut(auth);
      const credential = await signInAnonymously(auth);
      writeTabAnonClaim(credential.user.uid);
      return credential.user;
    })().finally(() => {
      anonymousAdoptionPromise = null;
    });
  }
  return anonymousAdoptionPromise;
}
