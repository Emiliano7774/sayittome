import { signInAnonymously, type User } from "firebase/auth";

import { useAnonymousTabPersistence } from "@/lib/auth/authPersistence";
import { auth } from "@/lib/firebase";

let anonymousSignInPromise: Promise<User> | null = null;

export function resolveStorageAuthAction(
  currentUser: { uid?: string; isAnonymous?: boolean } | null | undefined,
  options?: { allowAnonymous?: boolean },
): "use-current" | "sign-in-anonymous" | "reject" {
  if (currentUser) return "use-current";
  if (options?.allowAnonymous) return "sign-in-anonymous";
  return "reject";
}

export async function waitForAuthReady(): Promise<void> {
  await auth.authStateReady();
}

/** Profile and other owner-only uploads: never fall back to anonymous auth. */
export async function ensureRegisteredStorageAuth(): Promise<User> {
  await auth.authStateReady();

  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    throw new Error("auth_required");
  }

  return user;
}

/**
 * Firebase Storage requires an authenticated user.
 * Waits for persisted auth before deciding; anonymous sign-in is only for visitors.
 */
export async function ensureStorageAuth(options?: {
  allowAnonymous?: boolean;
}): Promise<User> {
  await auth.authStateReady();

  const action = resolveStorageAuthAction(auth.currentUser, options);
  if (action === "use-current" && auth.currentUser) {
    return auth.currentUser;
  }
  if (action === "reject") {
    throw new Error("auth_required");
  }

  // Several cold-start consumers can race before Firebase publishes the
  // first anonymous user. Share one sign-in request instead of issuing parallel
  // accounts:signUp calls. Session persistence keeps that uid tab-local so
  // sibling anonymous tabs are not the same person for match.
  if (!anonymousSignInPromise) {
    anonymousSignInPromise = useAnonymousTabPersistence()
      .then(() => signInAnonymously(auth))
      .then((credential) => credential.user)
      .finally(() => {
        anonymousSignInPromise = null;
      });
  }

  return anonymousSignInPromise;
}
