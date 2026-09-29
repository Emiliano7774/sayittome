import { auth } from "@/lib/firebase";

/** Anonymous visitors — cleared when leaving shuffle / visiting home. */
export const ANON_SHUFFLE_LEGAL_SESSION_KEY = "sayittome_anon_legal_accepted_v1";

/** Session flag so remounts never replay the legal modal after acceptance. */
export const SHUFFLE_LEGAL_UNLOCKED_SESSION_KEY = "sayittome:shuffle:legal-unlocked:v1";

const REGISTERED_SHUFFLE_LEGAL_PREFIX = "sayittome_shuffle_legal_v1:";

function registeredKey(uid: string) {
  return `${REGISTERED_SHUFFLE_LEGAL_PREFIX}${uid}`;
}

export function hasPersistedShuffleLegalUnlock() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SHUFFLE_LEGAL_UNLOCKED_SESSION_KEY) === "1";
}

export function persistShuffleLegalUnlock() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SHUFFLE_LEGAL_UNLOCKED_SESSION_KEY, "1");
}

export function hasShuffleLegalAcceptance(uid?: string | null) {
  if (typeof window === "undefined") return false;

  // Anonymous shuffle acceptance survives Firebase anonymous auth created for uploads.
  if (sessionStorage.getItem(ANON_SHUFFLE_LEGAL_SESSION_KEY) === "1") {
    return true;
  }

  if (hasPersistedShuffleLegalUnlock()) {
    return true;
  }

  // Registered profiles only — never treat an anonymous Firebase uid's
  // localStorage key as "entered", or the match door opens without Enter.
  const user = auth.currentUser;
  if (user && !user.isAnonymous) {
    return localStorage.getItem(registeredKey(user.uid)) === "1";
  }

  const firebaseUid = uid || "";
  if (firebaseUid && user && user.uid === firebaseUid && !user.isAnonymous) {
    return localStorage.getItem(registeredKey(firebaseUid)) === "1";
  }

  return false;
}

export function setShuffleLegalAcceptance(uid?: string | null) {
  if (typeof window === "undefined") return;

  persistShuffleLegalUnlock();

  const user = auth.currentUser;
  const firebaseUid = uid || user?.uid || "";
  if (firebaseUid && user && !user.isAnonymous && user.uid === firebaseUid) {
    localStorage.setItem(registeredKey(firebaseUid), "1");
  } else {
    sessionStorage.setItem(ANON_SHUFFLE_LEGAL_SESSION_KEY, "1");
  }

  try {
    void import("@/lib/anonMatch/anonMatchDoor").then((mod) => {
      mod.notifyAnonMatchDoorChanged();
    });
  } catch {
    // ignore
  }
}

/** Clears only the anonymous session flag — registered users keep their choice. */
export function clearSessionShuffleLegalAcceptance() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ANON_SHUFFLE_LEGAL_SESSION_KEY);
  sessionStorage.removeItem(SHUFFLE_LEGAL_UNLOCKED_SESSION_KEY);
  try {
    void import("@/lib/anonMatch/anonMatchDoor").then((mod) => {
      mod.notifyAnonMatchDoorChanged();
    });
    void import("@/services/anonymousPresence").then((mod) => {
      mod.removeAnonymousPresenceForMatchDoorClose?.();
    });
  } catch {
    // ignore
  }
}
