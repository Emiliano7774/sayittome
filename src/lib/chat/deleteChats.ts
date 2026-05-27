import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { unregisterSessionChat } from "@/lib/chat/sessionChats";

const MESSAGE_BATCH = 250;

export async function hardDeleteChat(chatId: string) {
  const cleanId = String(chatId || "").trim();
  if (!cleanId) return;

  while (true) {
    const snap = await getDocs(
      query(collection(db, "chats", cleanId, "mensajes"), limit(MESSAGE_BATCH)),
    );
    if (snap.empty) break;

    await Promise.all(snap.docs.map((messageDoc) => deleteDoc(messageDoc.ref)));
    if (snap.size < MESSAGE_BATCH) break;
  }

  await deleteDoc(doc(db, "chats", cleanId));
  unregisterSessionChat(cleanId);
}

export async function hardDeleteChats(chatIds: string[]) {
  const unique = [...new Set(chatIds.map((id) => id.trim()).filter(Boolean))];
  for (const chatId of unique) {
    await hardDeleteChat(chatId);
  }
}
