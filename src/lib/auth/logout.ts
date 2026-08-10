import { signOut } from "firebase/auth";

import { beginFreshAnonSession } from "@/lib/chat/anonSession";
import { clearCachedChatMessages } from "@/lib/chat/chatMessageCache";
import { clearInboxSnapshotCache } from "@/lib/chat/inboxSnapshot";
import { auth } from "@/lib/firebase";
import { deleteCurrentAnonymousStories } from "@/lib/stories/anonStories";

export async function logoutAndResetAnon() {
  await deleteCurrentAnonymousStories();
  beginFreshAnonSession();
  clearCachedChatMessages();
  clearInboxSnapshotCache();

  try {
    await signOut(auth);
  } catch (error) {
    console.error("logoutAndResetAnon", error);
    throw error;
  }
}
