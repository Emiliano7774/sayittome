import { collection, getDocs, query, where } from "firebase/firestore";

import { hardDeleteChats } from "@/lib/chat/deleteChats";
import { db } from "@/lib/firebase";

/** Deletes all profile/anon chat documents tied to a discarded anon session. */
export async function deleteAnonymousChatsForSession(anonSessionId: string) {
  if (!anonSessionId || !anonSessionId.startsWith("anon_")) {
    return;
  }

  try {
    const ids = new Set<string>();

    const [bySession, byParticipantes] = await Promise.all([
      getDocs(
        query(collection(db, "chats"), where("anonSessionId", "==", anonSessionId)),
      ),
      getDocs(
        query(
          collection(db, "chats"),
          where("participantes", "array-contains", anonSessionId),
        ),
      ),
    ]);

    for (const docSnap of bySession.docs) {
      ids.add(docSnap.id);
    }
    for (const docSnap of byParticipantes.docs) {
      ids.add(docSnap.id);
    }

    if (ids.size === 0) return;

    await hardDeleteChats([...ids]);
  } catch (error) {
    console.error("deleteAnonymousChatsForSession", anonSessionId, error);
  }
}
