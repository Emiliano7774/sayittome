"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useGlobalChatAlerts } from "@/hooks/useGlobalChatAlerts";

type ChatAlertsValue = ReturnType<typeof useGlobalChatAlerts>;

const ChatAlertsContext = createContext<ChatAlertsValue>({
  totalUnread: 0,
  viewerId: "",
  sortedChats: [],
});

export function ChatAlertsProvider({ children }: { children: ReactNode }) {
  const value = useGlobalChatAlerts();

  return (
    <ChatAlertsContext.Provider value={value}>{children}</ChatAlertsContext.Provider>
  );
}

export function useChatAlerts() {
  return useContext(ChatAlertsContext);
}
