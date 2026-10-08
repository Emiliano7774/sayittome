import { isValidUsername } from "@/lib/profile/username";

export function isNotificationProfileReady(input: {
  loading?: boolean;
  isAnonymous?: boolean;
  uid?: string;
  username?: string;
  profileSetupComplete?: boolean;
  email?: string;
  emailVerified?: boolean;
  /** Anonymous visitors: after shuffle enter (legal / door open). */
  anonDoorOpen?: boolean;
  /** Anonymous visitors: on a chat surface (thread / profile-chat). */
  anonChatOpen?: boolean;
}) {
  if (input.loading) return false;
  if (!String(input.uid || "").trim()) return false;

  // Anonymous sessions get chat notification rights once they enter Shuffle
  // or once they are already on a chat surface (anonChatOpen).
  if (input.isAnonymous) {
    return input.anonDoorOpen === true || input.anonChatOpen === true;
  }

  if (input.profileSetupComplete !== true) return false;
  if (!isValidUsername(String(input.username || ""))) return false;
  const email = String(input.email || "").trim();
  if (email && input.emailVerified !== true) return false;
  return true;
}
