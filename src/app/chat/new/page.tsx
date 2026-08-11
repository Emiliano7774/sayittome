"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { buildLegacyCanonicalSender } from "@/lib/chat/canonicalSender";
import {
  buildOutgoingChatMetaPatch,
  resolveChatRecipientIds,
} from "@/lib/chat/outgoingChatMeta";
import { profileAuthUid } from "@/lib/chat/profileAnonMessageAuthor";

function NewChatContent() {
  const params = useSearchParams();
  const router = useRouter();

  const to = params.get("to");

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const sendMessage = async () => {
    try {
      const currentUser = auth.currentUser;
      const liveUid = profileAuthUid(currentUser);
      const sender = buildLegacyCanonicalSender({
        authReady: Boolean(currentUser),
        liveProfileUid: liveUid,
      });

      if (!sender.ok || !to || !text.trim()) return;

      setSending(true);

      const clean = text.trim();
      const author = sender.sender;

      const chatsRef = collection(db, "chats");

      const existingQuery = query(
        chatsRef,
        where("participantes", "array-contains", author.senderAuthUid)
      );

      const existingChats = await getDocs(existingQuery);

      let existingChatId = "";

      existingChats.forEach((docSnap) => {
        const data = docSnap.data();

        const participantes = data.participantes || [];

        if (
          participantes.includes(author.senderAuthUid) &&
          participantes.includes(to)
        ) {
          existingChatId = docSnap.id;
        }
      });

      let chatId = existingChatId;

      if (!chatId) {
        const newChat = await addDoc(chatsRef, {
          participantes: [author.senderAuthUid, to],
          anon: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastMessage: clean,
          lastMessageSender: author.fromUid,
          readBy: {
            [author.senderAuthUid]: true,
          },
          typing: {
            [author.senderAuthUid]: false,
          },
        });

        chatId = newChat.id;
      }

      await addDoc(collection(db, "chats", chatId, "mensajes"), {
        texto: clean,
        fromUid: author.fromUid,
        senderAuthUid: author.senderAuthUid,
        senderProfileId: author.senderProfileId,
        senderRole: author.senderRole,
        senderKind: author.senderKind,
        createdByAuthUid: author.senderAuthUid,
        identityReadyAtWrite: true,
        createdAt: serverTimestamp(),
        readBy: {
          [author.senderAuthUid]: true,
        },
      });

      await updateDoc(
        doc(db, "chats", chatId),
        buildOutgoingChatMetaPatch(author.fromUid, resolveChatRecipientIds(author.senderAuthUid, {
          participantes: [author.senderAuthUid, to],
        }), {
          lastMessage: clean,
          lastMessageSender: author.fromUid,
        }),
      );

      setText("");

      router.push("/chat/" + chatId);
    } catch (e) {
      console.error(e);
      alert("No se pudo enviar.");
    }

    setSending(false);
  };

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white">
      <section className="mx-auto max-w-2xl">
        <div className="rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-fuchsia-950/30">
          <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-300">
            SAYITTOME
          </p>

          <h1 className="mt-3 text-4xl font-black">Mensaje anÃƒÂ³nimo</h1>

          <p className="mt-3 text-sm text-zinc-500">
            EnviÃƒÂ¡ un mensaje totalmente anÃƒÂ³nimo.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="EscribÃƒÂ­ tu mensaje..."
            className="mt-6 h-40 w-full resize-none rounded-3xl border border-white/10 bg-black p-5 text-sm outline-none focus:border-fuchsia-500"
          />

          <button
            onClick={sendMessage}
            disabled={sending}
            className="mt-6 w-full rounded-full bg-white px-6 py-4 text-sm font-black text-black transition hover:scale-[1.01] disabled:opacity-50"
          >
            {sending ? "Enviando..." : "Enviar anÃƒÂ³nimo"}
          </button>
        </div>
      </section>
    </main>
  );
}

export default function NewChatPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-black px-4 py-10 text-white">
          <section className="mx-auto max-w-2xl">
            <div className="rounded-[2rem] border border-white/10 bg-zinc-950 p-6 text-zinc-400">
              Cargando...
            </div>
          </section>
        </main>
      }
    >
      <NewChatContent />
    </Suspense>
  );
}
