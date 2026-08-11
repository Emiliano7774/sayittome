import { isValidUsername } from "@/lib/profile/username";

export function isNotificationProfileReady(input: {
  loading?: boolean;
  isAnonymous?: boolean;
  uid?: string;
  username?: string;
  profileSetupComplete?: boolean;
  email?: string;
  emailVerified?: boolean;
}) {
  if (input.loading) return false;
  if (input.isAnonymous) return false;
  if (!String(input.uid || "").trim()) return false;
  if (input.profileSetupComplete !== true) return false;
  if (!isValidUsername(String(input.username || ""))) return false;
  const email = String(input.email || "").trim();
  if (email && input.emailVerified !== true) return false;
  return true;
}
