import { deleteDoc, doc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { invalidateStoriesIndexAfterMutation } from "@/lib/stories/storiesIndexStore";

export async function deleteStoryById(storyId: string) {
  const cleanId = String(storyId || "").trim();
  if (!cleanId) return;

  await deleteDoc(doc(db, "historias", cleanId));
  invalidateStoriesIndexAfterMutation();
}
