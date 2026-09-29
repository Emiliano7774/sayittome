import { doc, updateDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { readVisibilityPayload } from "@/lib/shuffle/audiencePayload";

/**
 * "Quiénes pueden verme" has to live where the pools read it: on the profile doc
 * for registered users, on the presence doc for anonymous visitors.
 */
export async function publishVisibilityAudience() {
  const user = auth.currentUser;
  const payload = readVisibilityPayload();

  if (user && !user.isAnonymous) {
    await updateDoc(doc(db, "usuarios", user.uid), payload).catch(() => null);
    return;
  }

  await import("@/services/anonymousPresence")
    .then((mod) => mod.bumpAnonymousPresenceForMatch())
    .catch(() => null);
}
