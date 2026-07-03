"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import ProfileAnonChat from "@/components/chat/ProfileAnonChat";
import { ChatErrorScreen, ChatLoadingScreen } from "@/components/chat/ChatScreens";
import { isProfileAnonChatId, usernameHintFromAnonChatId } from "@/lib/chat/anonChatId";
import { resolveProfileChat, isOwnerProfileInboxRedirect } from "@/lib/chat/resolveProfileChat";
import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";
import { useT } from "@/contexts/LocaleContext";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

import LegacyChatPage from "./legacy-chat";

function ProfileAnonChatRoute() {
  const t = useT();
  const params = useParams();
  const searchParams = useSearchParams();
  const rawChatId = decodeURIComponent(String(params.chatId || ""));
  const usernameFromQuery = String(searchParams.get("u") || "");
  const canOpenImmediately = Boolean(usernameFromQuery) && isProfileAnonChatId(rawChatId);

  const [ready, setReady] = useState(canOpenImmediately);
  const [username, setUsername] = useState(usernameFromQuery);
  const [chatId, setChatId] = useState(rawChatId);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (canOpenImmediately) {
      prefetchChatThread(rawChatId);
    }
  }, [canOpenImmediately, rawChatId]);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      try {
        let resolvedUsername = usernameFromQuery;

        if (canOpenImmediately) {
          void getDoc(doc(db, "chats", rawChatId))
            .then((requestedSnap) => {
              if (cancelled || !requestedSnap.exists()) return;
              const requestedData = requestedSnap.data() as {
                targetUsername?: string;
                receptorUsername?: string;
              };
              const docUsername =
                requestedData.targetUsername || requestedData.receptorUsername || "";
              if (docUsername && docUsername !== usernameFromQuery) {
                setUsername(docUsername);
                const query = new URLSearchParams({ u: docUsername });
                window.history.replaceState(
                  null,
                  "",
                  `/chat/${encodeURIComponent(rawChatId)}?${query.toString()}`,
                );
              }
            })
            .catch(() => undefined);
          return;
        }

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
  }, [rawChatId, usernameFromQuery, canOpenImmediately, t]);

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
