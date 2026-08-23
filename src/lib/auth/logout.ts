import { signOut } from "firebase/auth";

import { resetChatNotificationPromptOnLogout } from "@/lib/chat/chatNotificationPrefs";
import { beginFreshAnonSession } from "@/lib/chat/anonSession";
import { invalidateProfileChatCache } from "@/lib/chat/resolveProfileChat";
import { clearCachedChatMessages } from "@/lib/chat/chatMessageCache";
import { deleteCurrentDeviceFcmToken } from "@/lib/chat/fcmPush";
import { clearInboxSnapshotCache } from "@/lib/chat/inboxSnapshot";
import { auth } from "@/lib/firebase";
import { deleteCurrentAnonymousStories } from "@/lib/stories/anonStories";
import { clearStoriesIndexCache } from "@/lib/stories/storiesIndexStore";
import { clearAuthorshipCorrections } from "@/lib/chat/authorshipCorrections";
import { clearCachedViewerIdentity } from "@/lib/chat/viewerIdentityCache";
import { clearThreadAnonContinuity } from "@/lib/chat/threadAnonContinuity";
import { clearShuffleChromeCache } from "@/lib/shuffle/shuffleChromeCache";
import { clearCachedFullProfile } from "@/lib/profile/profileCache";
import { clearVerifiedProfileLinkTicket } from "@/lib/profile/verifiedProfileLinkTicket";

export async function logoutAndResetAnon() {
  await deleteCurrentAnonymousStories();
  beginFreshAnonSession();
  invalidateProfileChatCache();
  clearCachedChatMessages();
  clearInboxSnapshotCache();
  clearStoriesIndexCache();
  clearCachedViewerIdentity();
  clearShuffleChromeCache();
  clearCachedFullProfile();
  clearVerifiedProfileLinkTicket();
  clearAuthorshipCorrections();
  clearThreadAnonContinuity();
  await deleteCurrentDeviceFcmToken(auth.currentUser?.uid || "");
  resetChatNotificationPromptOnLogout();

  try {
    await signOut(auth);
  } catch (error) {
    console.error("logoutAndResetAnon", error);
    throw error;
  }
}
