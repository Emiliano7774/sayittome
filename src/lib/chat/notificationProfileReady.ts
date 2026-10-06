import { isValidUsername } from "@/lib/profile/username";

export function isNotificationProfileReady(input: {
  loading?: boolean;
  isAnonymous?: boolean;
  uid?: string;
  username?: string;
  profileSetupComplete?: boolean;
  email?: string;
  emailVerified?: boolean;
  /** Anonymous visitors: only after shuffle enter (legal / door open). */
  anonDoorOpen?: boolean;
}) {
  if (input.loading) return false;
  if (!String(input.uid || "").trim()) return false;

  // Anonymous sessions get the same chat notification rights as registered
  // users (OS push / web banners / badge) once they enter Shuffle.
  if (input.isAnonymous) {
    return input.anonDoorOpen === true;
  }

  if (input.profileSetupComplete !== true) return false;
  if (!isValidUsername(String(input.username || ""))) return false;
  const email = String(input.email || "").trim();
  if (email && input.emailVerified !== true) return false;
  return true;
}
