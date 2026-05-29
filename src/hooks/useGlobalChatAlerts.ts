"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import { useChatsInbox } from "@/hooks/useChatsInbox";
import { globalChatWhipManager } from "@/lib/chat/globalChatWhipManager";
import { chatPeerTitle } from "@/lib/chat/inboxPeerTitle";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import {
  resolveInboxViewerId,
  totalUnreadCount,
} from "@/lib/chat/inboxUnread";
import { bindWhipSoundUnlock } from "@/lib/chat/whipSound";

export function useGlobalChatAlerts() {
  const pathname = usePathname();
  const { firebaseUser } = useAuth();
  const { sortedChats, uid, loading } = useChatsInbox();
  const viewerId = resolveInboxViewerId(uid);
  const firebaseUid = firebaseUser?.uid || uid || "";
  const totalUnread = totalUnreadCount(sortedChats, viewerId);
  const pathnameRef = useRef(pathname);
  const sortedChatsRef = useRef(sortedChats);

  pathnameRef.current = pathname;
  sortedChatsRef.current = sortedChats;

  useEffect(() => bindWhipSoundUnlock(), []);

  useEffect(() => {
    globalChatWhipManager.setContext({
      viewerId: viewerId || getChatAnonSenderId(),
      firebaseUid,
      getActiveChatId: () => {
        const match = pathnameRef.current.match(/\/chat\/([^/?#]+)/);
        return match ? decodeURIComponent(match[1]) : "";
      },
      getChatLabel: (chatId) => {
        const chat = sortedChatsRef.current.find(
          (row) => row.id === chatId || row.canonicalChatId === chatId,
        );
        return chat ? chatPeerTitle(chat, firebaseUid) : "Nuevo mensaje";
      },
    });
  }, [viewerId, firebaseUid]);

  useEffect(() => {
    if (loading) return;

    globalChatWhipManager.start();
    globalChatWhipManager.syncInboxForUid(firebaseUid);
  }, [loading, firebaseUid]);

  return {
    totalUnread,
    viewerId,
    sortedChats,
  };
}
