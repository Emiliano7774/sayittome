"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import ProfileAnonChat from "@/components/chat/ProfileAnonChat";
import { ChatErrorScreen, ChatLoadingScreen } from "@/components/chat/ChatScreens";
import {
  buildLegacyProfileChatIds,
  buildProfileAnonChatId,
  isProfileAnonChatId,
  usernameHintFromAnonChatId,
} from "@/lib/chat/anonChatId";
import { migrateToCanonicalChat } from "@/lib/chat/migrate";
import { fetchProfileByUsername } from "@/lib/chat/resolveProfileChat";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { registerSessionChat } from "@/lib/chat/sessionChats";
import { useT } from "@/contexts/LocaleContext";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

import LegacyChatPage from "./legacy-chat";

function ProfileAnonChatRoute() {
  const t = useT();
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
        if (cancelled) return;

        const firebaseUid = auth.currentUser?.uid || "";
        const senderId = getChatAnonSenderId();

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
          resolvedUsername = usernameHintFromAnonChatId(rawChatId);
        }

        if (!resolvedUsername) {
          setErrorText(t("chat_not_found"));
          setReady(true);
          return;
        }

        const profile = await fetchProfileByUsername(resolvedUsername);
        const canonicalUsername = String(profile?.username || resolvedUsername);
        const targetUid = String(profile?.uid || "");
        const canonicalId = buildProfileAnonChatId(senderId, canonicalUsername);
        const legacyIds = [
          ...buildLegacyProfileChatIds(senderId, canonicalUsername, targetUid),
          ...(firebaseUid
            ? buildLegacyProfileChatIds(
                firebaseUid,
                canonicalUsername,
                targetUid,
              )
            : []),
        ];

        if (rawChatId !== canonicalId) {
          legacyIds.push(rawChatId);
        }

        await migrateToCanonicalChat(canonicalId, legacyIds, {
          id: canonicalId,
          canonicalChatId: canonicalId,
          targetUsername: canonicalUsername,
          receptorUsername: canonicalUsername,
          receptorUid: targetUid || null,
          targetUid: targetUid || null,
          schemaVersion: 2,
        });

        registerSessionChat(canonicalId);

        if (cancelled) return;

        setUsername(canonicalUsername);
        setChatId(canonicalId);
        setReady(true);

        if (rawChatId !== canonicalId || usernameFromQuery !== canonicalUsername) {
          const query = new URLSearchParams({ u: canonicalUsername });
          window.history.replaceState(
            null,
            "",
            `/chat/${encodeURIComponent(canonicalId)}?${query.toString()}`,
          );
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setErrorText(t("chat_load_fail"));
          setReady(true);
        }
      }
    }

    prepare();

    return () => {
      cancelled = true;
    };
  }, [rawChatId, usernameFromQuery, t]);

  if (!ready) return <ChatLoadingScreen />;
  if (errorText || !chatId || !username) return <ChatErrorScreen message={errorText} />;

  return <ProfileAnonChat chatId={chatId} username={username} />;
}

function ChatEntryPage() {
  const params = useParams();
  const chatId = decodeURIComponent(String(params.chatId || ""));

  if (isProfileAnonChatId(chatId)) {
    return (
      <Suspense fallback={<ChatLoadingScreen />}>
        <ProfileAnonChatRoute />
      </Suspense>
    );
  }

  return <LegacyChatPage />;
}

export default ChatEntryPage;
