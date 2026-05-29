"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";

import ProfileAnonChat from "@/components/chat/ProfileAnonChat";
import { ChatErrorScreen, ChatLoadingScreen } from "@/components/chat/ChatScreens";
import { isProfileAnonChatId, usernameHintFromAnonChatId } from "@/lib/chat/anonChatId";
import { resolveProfileChat } from "@/lib/chat/resolveProfileChat";
import { useT } from "@/contexts/LocaleContext";
import { db } from "@/lib/firebase";

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
          if (!cancelled) {
            setErrorText(t("chat_not_found"));
            setReady(true);
          }
          return;
        }

        const resolved = await resolveProfileChat(resolvedUsername);
        if (cancelled) return;

        setUsername(resolved.username);
        setChatId(resolved.chatId);
        setReady(true);

        if (
          rawChatId !== resolved.chatId ||
          usernameFromQuery !== resolved.username
        ) {
          const query = new URLSearchParams({ u: resolved.username });
          window.history.replaceState(
            null,
            "",
            `/chat/${encodeURIComponent(resolved.chatId)}?${query.toString()}`,
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

    void prepare();

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
