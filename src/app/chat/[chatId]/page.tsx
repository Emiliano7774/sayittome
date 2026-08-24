"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import ProfileAnonChat from "@/components/chat/ProfileAnonChat";
import { ChatErrorScreen, ChatLoadingScreen } from "@/components/chat/ChatScreens";
import { isProfileAnonChatId, usernameHintFromAnonChatId, chatPageComposer } from "@/lib/chat/anonChatId";
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
  const usernameHint = usernameFromQuery || usernameHintFromAnonChatId(rawChatId);
  const canOpenImmediately = Boolean(usernameHint) && isProfileAnonChatId(rawChatId);

  const [ready, setReady] = useState(canOpenImmediately);
  const [username, setUsername] = useState(usernameHint);
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
                canonicalChatId?: string;
              };
              const canonicalChatId = String(requestedData.canonicalChatId || "").trim();
              const docUsername =
                requestedData.targetUsername || requestedData.receptorUsername || "";
              const resolvedChatId =
                canonicalChatId &&
                canonicalChatId !== rawChatId &&
                isProfileAnonChatId(canonicalChatId)
                  ? canonicalChatId
                  : rawChatId;
              if (docUsername) setUsername(docUsername);
              if (resolvedChatId !== rawChatId) {
                setChatId(resolvedChatId);
                prefetchChatThread(resolvedChatId);
              }
              if (
                resolvedChatId !== rawChatId ||
                (docUsername && docUsername !== usernameFromQuery)
              ) {
                const query = new URLSearchParams();
                if (docUsername || usernameFromQuery) {
                  query.set("u", docUsername || usernameFromQuery);
                }
                if (String(searchParams.get("from") || "") === "push") {
                  query.set("from", "push");
                  const mid = String(searchParams.get("mid") || "").trim();
                  if (mid) query.set("mid", mid);
                }
                const qs = query.toString();
                window.history.replaceState(
                  null,
                  "",
                  `/chat/${encodeURIComponent(resolvedChatId)}${qs ? `?${qs}` : ""}`,
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
              canonicalChatId?: string;
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

          const canonicalChatId = String(requestedData?.canonicalChatId || "").trim();
          const resolvedChatId =
            canonicalChatId &&
            canonicalChatId !== rawChatId &&
            isProfileAnonChatId(canonicalChatId)
              ? canonicalChatId
              : rawChatId;
          setUsername(resolvedUsername);
          setChatId(resolvedChatId);
          setReady(true);
          if (resolvedChatId !== rawChatId) prefetchChatThread(resolvedChatId);

          if (
            resolvedChatId !== rawChatId ||
            usernameFromQuery !== resolvedUsername
          ) {
            const query = new URLSearchParams({ u: resolvedUsername });
            window.history.replaceState(
              null,
              "",
              `/chat/${encodeURIComponent(resolvedChatId)}?${query.toString()}`,
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

  if (chatPageComposer(chatId) === "profile-anon") {
    return (
      <Suspense fallback={null}>
        <ProfileAnonChatRoute />
      </Suspense>
    );
  }

  return <LegacyChatPage />;
}

export default ChatEntryPage;
