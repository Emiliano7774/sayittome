"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import ChatsInboxPage from "@/components/chats/ChatsInboxPage";
import { isMainTabRouteHandledByKeepAlive } from "@/components/navigation/MainTabKeepAliveHost";
import {
  getMainTabKeepAliveVersion,
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

  if (isMainTabRouteHandledByKeepAlive(pathname, "/chats")) {
    return null;
  }

  return <ChatsRouteContent />;
}
