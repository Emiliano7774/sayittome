import { signOut } from "firebase/auth";

import { resetChatNotificationPromptOnLogout } from "@/lib/chat/chatNotificationPrefs";
import { rotateAnonSessionPreserving } from "@/lib/chat/anonSession";
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
 * Session chat list may retain old ids, but resolve only reuses when live anon
 * matches — so the receptor sees a new thread after re-login + send.
 * Never wipe message history or delete old chats.
 */
export async function logoutAndResetAnon() {
  await deleteCurrentAnonymousStories();
  rotateAnonSessionPreserving();
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
