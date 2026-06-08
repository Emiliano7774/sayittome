import { signInAnonymously, type User } from "firebase/auth";

import { auth } from "@/lib/firebase";

/** Firebase Storage requires an authenticated user, including anonymous visitors. */
export async function ensureStorageAuth(): Promise<User> {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  const credential = await signInAnonymously(auth);
  return credential.user;
}
