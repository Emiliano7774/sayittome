import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
} from "firebase/auth";

import { auth } from "@/lib/firebase";

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
