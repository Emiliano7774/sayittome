"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import ProfileAnonChat from "@/components/chat/ProfileAnonChat";
import { isProfileAnonChatId } from "@/lib/chat/anonChatId";
import {
  buildLegacyProfileChatIds,
  buildProfileAnonChatId,
} from "@/lib/chat/anonChatId";
import { migrateToCanonicalChat } from "@/lib/chat/migrate";
import { fetchProfileByUsername } from "@/lib/chat/resolveProfileChat";
import { getAnonSessionId } from "@/lib/chat/anonSession";
import { registerSessionChat } from "@/lib/chat/sessionChats";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

import LegacyChatPage from "./legacy-chat";

function ProfileAnonChatRoute() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawChatId = decodeURIComponent(String(params.chatId || ""));
  const usernameFromQuery = String(searchParams.get("u") || "");

  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState(usernameFromQuery);
  const [chatId, setChatId] = useState(rawChatId);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      try {
        const unsub = await new Promise<void>((resolve) => {
          const off = onAuthStateChanged(auth, () => {
            off();
            resolve();
          });
        });

        if (cancelled) return;

        const firebaseUid = auth.currentUser?.uid || "";
        const senderId = firebaseUid || getAnonSessionId();

        let resolvedUsername = usernameFromQuery;

        if (!resolvedUsername) {
          const chatSnap = await getDoc(doc(db, "chats", rawChatId));
          if (chatSnap.exists()) {
            const data = chatSnap.data() as {
              targetUsername?: string;
              receptorUsername?: string;
            };
            resolvedUsername =
              data.targetUsername || data.receptorUsername || "";
          }
        }

        if (!resolvedUsername) {
          setErrorText("Chat no encontrado.");
          setReady(true);
          return;
        }

        const profile = await fetchProfileByUsername(resolvedUsername);
        const targetUid = String(profile?.uid || "");
        const canonicalId = buildProfileAnonChatId(senderId, resolvedUsername);
        const legacyIds = buildLegacyProfileChatIds(
          senderId,
          resolvedUsername,
          targetUid,
        );

        if (rawChatId !== canonicalId) {
          legacyIds.push(rawChatId);
        }

        await migrateToCanonicalChat(canonicalId, legacyIds, {
          id: canonicalId,
          canonicalChatId: canonicalId,
          targetUsername: resolvedUsername,
          receptorUsername: resolvedUsername,
          receptorUid: targetUid || null,
          targetUid: targetUid || null,
          schemaVersion: 2,
        });

        if (!firebaseUid) {
          registerSessionChat(canonicalId);
        }

        if (cancelled) return;

        setUsername(resolvedUsername);
        setChatId(canonicalId);
        setReady(true);

        if (rawChatId !== canonicalId) {
          const query = new URLSearchParams({ u: resolvedUsername });
          window.history.replaceState(
            null,
            "",
            `/chat/${encodeURIComponent(canonicalId)}?${query.toString()}`,
          );
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setErrorText("No se pudo cargar el chat.");
          setReady(true);
        }
      }
    }

    prepare();

    return () => {
      cancelled = true;
    };
  }, [rawChatId, usernameFromQuery]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl font-black text-white/40">Cargando chat...</p>
      </main>
    );
  }

  if (errorText || !chatId || !username) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-white">
        <p className="text-2xl font-black text-white/40">{errorText || "Chat no disponible."}</p>
        <Link href="/chats" className="text-violet-400 font-bold">
          Volver a chats
        </Link>
      </main>
    );
  }

  return <ProfileAnonChat chatId={chatId} username={username} />;
}

function ChatEntryPage() {
  const params = useParams();
  const chatId = decodeURIComponent(String(params.chatId || ""));

  if (isProfileAnonChatId(chatId)) {
    return (
      <Suspense
        fallback={
          <main className="flex min-h-screen items-center justify-center bg-black text-white">
            <p className="text-2xl font-black text-white/40">Cargando chat...</p>
          </main>
        }
      >
        <ProfileAnonChatRoute />
      </Suspense>
    );
  }

  return <LegacyChatPage />;
}

export default ChatEntryPage;
