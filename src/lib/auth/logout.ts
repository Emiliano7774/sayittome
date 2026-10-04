import { signOut } from "firebase/auth";

import { resetChatNotificationPromptOnLogout } from "@/lib/chat/chatNotificationPrefs";
import { rotateAnonSessionPreserving } from "@/lib/chat/anonSession";
import { resetInboxForIdentityChange } from "@/lib/chat/inboxIdentityReset";
import { deleteCurrentDeviceFcmToken } from "@/lib/chat/fcmPush";
import { auth } from "@/lib/firebase";
import { deleteCurrentAnonymousStories } from "@/lib/stories/anonStories";
import { clearStoriesIndexCache } from "@/lib/stories/storiesIndexStore";
import { clearCachedViewerIdentity } from "@/lib/chat/viewerIdentityCache";
import { clearShuffleChromeCache } from "@/lib/shuffle/shuffleChromeCache";
import { clearShuffleSessionSnapshot } from "@/lib/navigation/shuffleSessionSnapshot";
import { clearCachedFullProfile } from "@/lib/profile/profileCache";
import { disarmVerifiedProfileLinkClaimRetry } from "@/lib/profile/verifiedProfileLinkClaimRetry";
import { clearVerifiedProfileLinkTicket } from "@/lib/profile/verifiedProfileLinkTicket";

/**
 * Explicit logout → next login: rotate live anon identity once.
 * Local inbox snapshot/session rows are dropped so a later anonymous entry
 * cannot paint this profile's chats. Server history is not deleted.
 */
export async function logoutAndResetAnon() {
  await deleteCurrentAnonymousStories();
  rotateAnonSessionPreserving();
  resetInboxForIdentityChange();
  clearStoriesIndexCache();
  clearCachedViewerIdentity();
  clearShuffleChromeCache();
  clearShuffleSessionSnapshot();
  clearCachedFullProfile();
  disarmVerifiedProfileLinkClaimRetry();
  clearVerifiedProfileLinkTicket();
  await deleteCurrentDeviceFcmToken(auth.currentUser?.uid || "");
  resetChatNotificationPromptOnLogout();

  try {
    await signOut(auth);
  } catch (error) {
    console.error("logoutAndResetAnon", error);
    throw error;
  }
}
