"use client";

import ChatsInboxErrorBoundary from "@/components/chats/ChatsInboxErrorBoundary";
import ClassicChatsInbox from "@/components/chats/ClassicChatsInbox";
import ModernChatsInbox from "@/components/chats/ModernChatsInbox";
import { useEffect } from "react";

import { useChatAlerts } from "@/contexts/ChatAlertsContext";
import { useUxMode } from "@/contexts/UxModeContext";
import { useChatsSelection } from "@/hooks/useChatsSelection";
import { shouldShowChatsInboxSkeleton } from "@/hooks/useChatsInboxReady";
import { useChatsTabPaint } from "@/hooks/useChatsTabPaint";
import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";
import { useT } from "@/contexts/LocaleContext";

function ChatsPageSkeleton() {
  const t = useT();

  return (
    <main
      data-nav-loading-copy="1"
      className="flex min-h-screen items-center justify-center bg-black text-white/35"
    >
      <p className="text-sm font-bold">{t("common_loading")}</p>
    </main>
  );
}

export default function ChatsInboxPage() {
  const { uxMode } = useUxMode();
  const inbox = useChatAlerts();
  const selection = useChatsSelection(inbox.sortedChats);

  useChatsTabPaint({
    loading: inbox.loading,
    sortedChats: inbox.sortedChats,
    firestoreHydrated: inbox.firestoreSynced,
  });

  const warmIds = inbox.sortedChats
    .slice(0, 8)
    .map((chat) => chat.canonicalChatId || chat.id)
    .join("|");

  useEffect(() => {
    const ids = warmIds.split("|").filter(Boolean);
    if (ids.length === 0) return;
    let cancelled = false;
    const useIdle = typeof window.requestIdleCallback === "function";
    const run = () => {
      if (cancelled) return;
      for (const id of ids) prefetchChatThread(id);
    };
    const idleId = useIdle
      ? window.requestIdleCallback(run)
      : window.setTimeout(run, 150);
    return () => {
      cancelled = true;
      if (useIdle) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, [warmIds]);

  if (shouldShowChatsInboxSkeleton(inbox)) {
    return <ChatsPageSkeleton />;
  }

  return (
    <ChatsInboxErrorBoundary>
      {uxMode === "modern" ? (
        <ModernChatsInbox
          sortedChats={inbox.sortedChats}
          uid={inbox.uid}
          isAnonymousSession={inbox.isAnonymousSession}
          firestoreSynced={inbox.firestoreSynced}
          selection={selection}
        />
      ) : (
        <ClassicChatsInbox
          sortedChats={inbox.sortedChats}
          uid={inbox.uid}
          isAnonymousSession={inbox.isAnonymousSession}
          firestoreSynced={inbox.firestoreSynced}
          selection={selection}
        />
      )}
    </ChatsInboxErrorBoundary>
  );
}
