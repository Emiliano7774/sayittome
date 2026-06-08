"use client";

import { useUxMode } from "@/contexts/UxModeContext";
import { useChatAlerts } from "@/contexts/ChatAlertsContext";
import ClassicChatsInbox from "@/components/chats/ClassicChatsInbox";
import ModernChatsInbox from "@/components/chats/ModernChatsInbox";
import { useChatsSelection } from "@/hooks/useChatsSelection";

export default function ChatsPage() {
  const { uxMode } = useUxMode();
  const inbox = useChatAlerts();
  const selection = useChatsSelection(inbox.sortedChats);

  if (uxMode === "modern") {
    return (
      <ModernChatsInbox
        sortedChats={inbox.sortedChats}
        uid={inbox.uid}
        isAnonymousSession={inbox.isAnonymousSession}
        selection={selection}
      />
    );
  }

  return (
    <ClassicChatsInbox
      sortedChats={inbox.sortedChats}
      uid={inbox.uid}
      isAnonymousSession={inbox.isAnonymousSession}
      selection={selection}
    />
  );
}
