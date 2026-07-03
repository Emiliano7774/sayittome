"use client";

import { useEffect, useState } from "react";

import ChatsInboxErrorBoundary from "@/components/chats/ChatsInboxErrorBoundary";
import ClassicChatsInbox from "@/components/chats/ClassicChatsInbox";
import ModernChatsInbox from "@/components/chats/ModernChatsInbox";
import { useChatAlerts } from "@/contexts/ChatAlertsContext";
import { useUxMode } from "@/contexts/UxModeContext";
import { useChatsSelection } from "@/hooks/useChatsSelection";
import { shouldShowChatsInboxSkeleton } from "@/hooks/useChatsInboxReady";
import { useT } from "@/contexts/LocaleContext";

function ChatsPageSkeleton() {
  const t = useT();

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white/35">
      <p className="text-sm font-bold">{t("common_loading")}</p>
    </main>
  );
}

/** Native shell inbox: shared ChatAlerts pipeline (supports anonymous sessions). */
export default function NativeChatsInboxLite() {
  const { uxMode } = useUxMode();
  const inbox = useChatAlerts();
  const selection = useChatsSelection(inbox.sortedChats);
  const [mounted, setMounted] = useState(false);
  const [authGraceReady, setAuthGraceReady] = useState(false);

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
