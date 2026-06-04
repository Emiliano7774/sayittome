import { auth } from "@/lib/firebase";

/** Anonymous visitors — cleared when leaving shuffle / visiting home. */
export const ANON_SHUFFLE_LEGAL_SESSION_KEY = "sayittome_anon_legal_accepted_v1";

const REGISTERED_SHUFFLE_LEGAL_PREFIX = "sayittome_shuffle_legal_v1:";

function registeredKey(uid: string) {
  return `${REGISTERED_SHUFFLE_LEGAL_PREFIX}${uid}`;
}

export function hasShuffleLegalAcceptance(uid?: string | null) {
  if (typeof window === "undefined") return false;

  const firebaseUid = uid || auth.currentUser?.uid || "";
  if (firebaseUid) {
    return localStorage.getItem(registeredKey(firebaseUid)) === "1";
  }

  return sessionStorage.getItem(ANON_SHUFFLE_LEGAL_SESSION_KEY) === "1";
}

export function setShuffleLegalAcceptance(uid?: string | null) {
  if (typeof window === "undefined") return;

  const firebaseUid = uid || auth.currentUser?.uid || "";
  if (firebaseUid) {
    localStorage.setItem(registeredKey(firebaseUid), "1");
    return;
  }

  sessionStorage.setItem(ANON_SHUFFLE_LEGAL_SESSION_KEY, "1");
}

/** Clears only the anonymous session flag — registered users keep their choice. */
export function clearSessionShuffleLegalAcceptance() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ANON_SHUFFLE_LEGAL_SESSION_KEY);
}
