import { signOut } from "firebase/auth";

import { beginFreshAnonSession } from "@/lib/chat/anonSession";
import { clearCachedChatMessages } from "@/lib/chat/chatMessageCache";
import { deleteCurrentDeviceFcmToken } from "@/lib/chat/fcmPush";
import { clearInboxSnapshotCache } from "@/lib/chat/inboxSnapshot";
import { auth } from "@/lib/firebase";
import { deleteCurrentAnonymousStories } from "@/lib/stories/anonStories";
import { clearStoriesIndexCache } from "@/lib/stories/storiesIndexStore";
import { clearCachedViewerIdentity } from "@/lib/chat/viewerIdentityCache";

export async function logoutAndResetAnon() {
  await deleteCurrentAnonymousStories();
  beginFreshAnonSession();
  clearCachedChatMessages();
  clearInboxSnapshotCache();
  clearStoriesIndexCache();
  clearCachedViewerIdentity();
  await deleteCurrentDeviceFcmToken(auth.currentUser?.uid || "");

  try {
    await signOut(auth);
  } catch (error) {
    console.error("logoutAndResetAnon", error);
    throw error;
  }
}
