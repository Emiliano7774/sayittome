import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type PersistDirectMessageInput = {
  chatId: string;
  senderId: string;
  senderTipo: "perfil" | "anonimo";
  messageText: string;
};

export async function persistAnonDirectMessage(input: PersistDirectMessageInput) {
  const { chatId, senderId, senderTipo, messageText } = input;
  const batch = writeBatch(db);

  const chatRef = doc(db, "chats_anonimos", chatId);
  batch.set(
    chatRef,
    {
      chatId,
      ultimoMensaje: messageText,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const messageRef = doc(collection(db, "chats_anonimos", chatId, "mensajes"));
  batch.set(messageRef, {
    senderId,
    senderTipo,
    texto: messageText,
    text: messageText,
    createdAt: serverTimestamp(),
  });

  await batch.commit();
}
