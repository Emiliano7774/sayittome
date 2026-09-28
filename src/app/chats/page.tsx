"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import ChatsInboxPage from "@/components/chats/ChatsInboxPage";
import {
  getMainTabKeepAliveVersion,
  isMainTabRouteHandledByKeepAlive,
  subscribeMainTabKeepAlive,
} from "@/lib/navigation/mainTabKeepAlive";

export function ChatsRouteContent() {
  return <ChatsInboxPage />;
}

export default function ChatsPage() {
  const pathname = usePathname();

  useSyncExternalStore(
    subscribeMainTabKeepAlive,
    getMainTabKeepAliveVersion,
    getMainTabKeepAliveVersion,
  );

  // Suppress when keep-alive owns this tab OR another concrete main tab
  // (stale Next page slot after soft history pushState).
  if (isMainTabRouteHandledByKeepAlive(pathname, "/chats")) {
    return null;
  }

  return <ChatsRouteContent />;
}
