"use client";

import { useEffect, useState } from "react";

import ChatsInboxErrorBoundary from "@/components/chats/ChatsInboxErrorBoundary";
import ClassicChatsInbox from "@/components/chats/ClassicChatsInbox";
import ModernChatsInbox from "@/components/chats/ModernChatsInbox";
import NativeChatsInboxLite from "@/components/chats/NativeChatsInboxLite";
import { isNativeAppShell } from "@/lib/app/nativeShell";
import { useUxMode } from "@/contexts/UxModeContext";
import { useChatAlerts } from "@/contexts/ChatAlertsContext";
import { useChatsSelection } from "@/hooks/useChatsSelection";
import { shouldShowChatsInboxSkeleton } from "@/hooks/useChatsInboxReady";

function ChatsPageSkeleton() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white/35">
      <p className="text-sm font-bold">Cargando chats...</p>
    </main>
  );
}

function WebChatsPage() {
  const [mounted, setMounted] = useState(false);
  const [authGraceReady, setAuthGraceReady] = useState(false);
  const { uxMode } = useUxMode();
  const inbox = useChatAlerts();
  const selection = useChatsSelection(inbox.sortedChats);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setAuthGraceReady(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  if (shouldShowChatsInboxSkeleton(inbox, mounted, authGraceReady)) {
    return <ChatsPageSkeleton />;
  }

  return (
    <ChatsInboxErrorBoundary>
      {uxMode === "modern" ? (
        <ModernChatsInbox
          sortedChats={inbox.sortedChats}
          uid={inbox.uid}
          isAnonymousSession={inbox.isAnonymousSession}
          selection={selection}
        />
      ) : (
        <ClassicChatsInbox
          sortedChats={inbox.sortedChats}
          uid={inbox.uid}
          isAnonymousSession={inbox.isAnonymousSession}
          selection={selection}
        />
      )}
    </ChatsInboxErrorBoundary>
  );
}

export default function ChatsPage() {
  const [nativeShell, setNativeShell] = useState(false);

  useEffect(() => {
    setNativeShell(isNativeAppShell());
  }, []);

  if (nativeShell) {
    return <NativeChatsInboxLite />;
  }

  return <WebChatsPage />;
}
