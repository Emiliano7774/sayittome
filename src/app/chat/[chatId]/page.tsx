"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";

import ProfileAnonChat from "@/components/chat/ProfileAnonChat";
import { ChatErrorScreen, ChatLoadingScreen } from "@/components/chat/ChatScreens";
import { isProfileAnonChatId, usernameHintFromAnonChatId } from "@/lib/chat/anonChatId";
import { resolveProfileChat, isOwnerProfileInboxRedirect } from "@/lib/chat/resolveProfileChat";
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

        const requestedSnap = await getDoc(doc(db, "chats", rawChatId));
        const requestedData = requestedSnap.exists()
          ? (requestedSnap.data() as {
              targetUsername?: string;
              receptorUsername?: string;
            })
          : null;

        if (!resolvedUsername && requestedData) {
          resolvedUsername =
            requestedData.targetUsername || requestedData.receptorUsername || "";
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

        if (requestedSnap.exists()) {
          if (cancelled) return;

          setUsername(resolvedUsername);
          setChatId(rawChatId);
          setReady(true);

          if (usernameFromQuery !== resolvedUsername) {
            const query = new URLSearchParams({ u: resolvedUsername });
            window.history.replaceState(
              null,
              "",
              `/chat/${encodeURIComponent(rawChatId)}?${query.toString()}`,
            );
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
          if (isOwnerProfileInboxRedirect(e)) {
            window.location.replace("/chats");
            return;
          }
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
