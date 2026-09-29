/**
 * Anon-match "door": when a visitor may publish presence / receive match alerts.
 *
 * Registered profiles: open whenever Firebase auth is a non-anonymous user.
 * Anonymous visitors: open ONLY after explicit shuffle enter (legal accept).
 * Auto-signed Firebase anonymous auth alone must NOT open the door.
 */

import type { User } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { hasShuffleLegalAcceptance } from "@/lib/legal/shuffleTerms";

export const ANON_MATCH_DOOR_EVENT = "sayittome-anon-match-door";

export function isAnonMatchDoorOpen(
  user?: Pick<User, "uid" | "isAnonymous"> | null,
): boolean {
  const live = user === undefined ? auth.currentUser : user;
  if (!live?.uid) return false;
  if (!live.isAnonymous) return true;
  return hasShuffleLegalAcceptance(live.uid);
}

export function notifyAnonMatchDoorChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(ANON_MATCH_DOOR_EVENT));
  } catch {
    // ignore
  }
}
