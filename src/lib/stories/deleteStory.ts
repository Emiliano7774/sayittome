import { deleteDoc, doc } from "firebase/firestore";

import { db } from "@/lib/firebase";

export async function deleteStoryById(storyId: string) {
  const cleanId = String(storyId || "").trim();
  if (!cleanId) return;

  await deleteDoc(doc(db, "historias", cleanId));
}
