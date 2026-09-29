import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInAnonymously,
  signOut,
  type User,
} from "firebase/auth";

import { auth } from "@/lib/firebase";

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

/**
 * Replace an anonymous uid inherited from shared browser storage with one this
 * tab owns. Runs before any alias bind so no request carries a foreign alias.
 */
export async function adoptTabLocalAnonymousAuth(current: User): Promise<User> {
  if (!current.isAnonymous) return current;
  if (readTabAnonClaim() === current.uid) return current;

  await useAnonymousTabPersistence();
  await signOut(auth).catch(() => null);
  const credential = await signInAnonymously(auth);
  writeTabAnonClaim(credential.user.uid);
  return credential.user;
}
