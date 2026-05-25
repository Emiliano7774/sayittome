import {
  doc,
  increment,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export async function increaseUnread(
  chatId: string,
  targetUid: string,
) {
  await updateDoc(
    doc(
      db,
      "chats",
      chatId,
    ),
    {
      [
        `unreadCounts.${targetUid}`
      ]: increment(1),
    },
  );
}

export async function clearUnread(
  chatId: string,
  uid: string,
) {
  await updateDoc(
    doc(
      db,
      "chats",
      chatId,
    ),
    {
      [
        `unreadCounts.${uid}`
      ]: 0,
    },
  );
}
