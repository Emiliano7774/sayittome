"use client";

import { useUxMode } from "@/contexts/UxModeContext";
import ClassicChatsInbox from "@/components/chats/ClassicChatsInbox";
import ModernChatsInbox from "@/components/chats/ModernChatsInbox";
import { useChatsInbox } from "@/hooks/useChatsInbox";

export default function ChatsPage() {
  const { uxMode } = useUxMode();
  const inbox = useChatsInbox();

  if (uxMode === "modern") {
    return (
      <ModernChatsInbox
        sortedChats={inbox.sortedChats}
        uid={inbox.uid}
        isAnonymousSession={inbox.isAnonymousSession}
      />
    );
  }

  return (
    <ClassicChatsInbox
      sortedChats={inbox.sortedChats}
      uid={inbox.uid}
      isAnonymousSession={inbox.isAnonymousSession}
    />
  );
}
