import { signOut } from "firebase/auth";

import { beginFreshAnonSession } from "@/lib/chat/anonSession";
import { auth } from "@/lib/firebase";
import { deleteCurrentAnonymousStories } from "@/lib/stories/anonStories";

export async function logoutAndResetAnon() {
  await deleteCurrentAnonymousStories();
  beginFreshAnonSession();

  try {
    await signOut(auth);
  } catch (error) {
    console.error("logoutAndResetAnon", error);
    throw error;
  }
}
