"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useGlobalChatAlerts } from "@/hooks/useGlobalChatAlerts";

type ChatAlertsValue = ReturnType<typeof useGlobalChatAlerts>;

const ChatAlertsContext = createContext<ChatAlertsValue>({
  totalUnread: 0,
  viewerId: "",
  sortedChats: [],
  uid: "",
  loading: true,
  isAnonymousSession: false,
  inboxQueriesEnabled: false,
  firestoreSynced: false,
});

export function ChatAlertsProvider({ children }: { children: ReactNode }) {
  const alerts = useGlobalChatAlerts();
  const value = useMemo(
    () => alerts,
    [
      alerts.totalUnread,
      alerts.viewerId,
      alerts.sortedChats,
      alerts.uid,
      alerts.loading,
      alerts.isAnonymousSession,
      alerts.inboxQueriesEnabled,
    ],
  );

  return (
    <ChatAlertsContext.Provider value={value}>{children}</ChatAlertsContext.Provider>
  );
}

export function useChatAlerts() {
  return useContext(ChatAlertsContext);
}
