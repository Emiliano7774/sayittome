import {
  addDoc,
  collection,
  doc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import type {
  ChatMessage,
} from "./types";

export async function ensureChat(
  chatId: string,
  payload: Record<
    string,
    unknown
  >,
) {
  await setDoc(
    doc(
      db,
      "chats",
      chatId,
    ),
    payload,
    {
      merge: true,
    },
  );
}

export async function sendMessage(
  chatId: string,
  message: Record<
    string,
    unknown
  >,
) {
  const senderRole = String(message.senderRole || "").trim();
  const senderAuthUid = String(message.senderAuthUid || "").trim();
  const fromUid = String(message.fromUid || "").trim();
  if (!fromUid || (senderRole !== "profile" && senderRole !== "anon")) {
    throw new Error("canonical_sender_required");
  }
  if (senderRole === "profile" && !senderAuthUid) {
    throw new Error("canonical_sender_required");
  }

  await addDoc(
    collection(
      db,
      "chats",
      chatId,
      "mensajes",
    ),
    {
      ...message,
      createdAt:
        serverTimestamp(),
    },
  );
}

export function listenMessages(
  chatId: string,
  callback: (
    messages: ChatMessage[],
  ) => void,
) {
  const q = query(
    collection(
      db,
      "chats",
      chatId,
      "mensajes",
    ),

    orderBy(
      "createdAt",
      "asc",
    ),
    limitToLast(50),
  );

  return onSnapshot(
    q,
    (snap) => {
      const msgs =
        snap.docs.map(
          (d) =>
            ({
              id: d.id,
              ...d.data(),
            }) as ChatMessage,
        );

      callback(msgs);
    },
  );
}

export async function markSeen(
  chatId: string,
  messageId: string,
  uid: string,
) {
  await updateDoc(
    doc(
      db,
      "chats",
      chatId,
      "mensajes",
      messageId,
    ),
    {
      [`seenBy.${uid}`]:
        true,
    },
  );
}
