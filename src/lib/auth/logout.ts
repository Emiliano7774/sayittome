import { signOut } from "firebase/auth";

import { beginFreshAnonSession } from "@/lib/chat/anonSession";
import { auth } from "@/lib/firebase";

export async function logoutAndResetAnon() {
  beginFreshAnonSession();

  try {
    await signOut(auth);
  } catch (error) {
    console.error("logoutAndResetAnon", error);
    throw error;
  }
}
