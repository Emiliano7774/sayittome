import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { getAnonSessionId } from "@/lib/chat/anonSession";
import { auth, db } from "@/lib/firebase";

export {
  canManageStory,
  fetchProfileStoryIdentity,
  isInvalidPublicStoryUsername,
  resolveStoryAuthor,
  resolveStoryViewerId,
  usernameFromProfileData,
} from "@/lib/stories/storyAuthor";
export type { StoryAuthor } from "@/lib/stories/storyAuthor";

export async function deleteAnonymousStoriesForSession(anonSessionId: string) {
  if (!anonSessionId || !anonSessionId.startsWith("anon_")) {
    return;
  }

  try {
    const snap = await getDocs(
      query(collection(db, "historias"), where("anonSessionId", "==", anonSessionId)),
    );

    await Promise.all(snap.docs.map((storyDoc) => deleteDoc(doc(db, "historias", storyDoc.id))));
  } catch (error) {
    console.error("deleteAnonymousStoriesForSession", error);
  }
}

export async function deleteCurrentAnonymousStories() {
  if (typeof window === "undefined") {
    return;
  }

  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    return;
  }

  await deleteAnonymousStoriesForSession(getAnonSessionId());
}
