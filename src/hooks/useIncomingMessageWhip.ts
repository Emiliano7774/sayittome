"use client";

import { useEffect, useRef } from "react";

import type { InboxChat } from "@/hooks/useChatsInbox";
import { isIncomingMessageFromDoc } from "@/lib/chat/incomingChatActivity";
import { tryAlertIncomingMessage } from "@/lib/chat/whipAlertDedupe";
import { bindWhipSoundUnlock, notifyIncomingChatMessage, playIncomingWhipSound } from "@/lib/chat/whipSound";

type IncomingMessage = {
  id: string;
  mine?: boolean;
  fromUid?: string;
  senderKind?: string;
  text?: string;
};

export function useIncomingMessageWhip(
  messages: IncomingMessage[],
  currentViewerId: string,
  enabled = true,
  chatId = "",
  firebaseUid = "",
  chat?: InboxChat,
) {
  const firstLoadRef = useRef(true);
  const lastIncomingIdRef = useRef<string | null>(null);

  useEffect(() => bindWhipSoundUnlock(), []);

  useEffect(() => {
    if (!enabled || messages.length === 0) {
      if (firstLoadRef.current) firstLoadRef.current = false;
      return;
    }

    const last = messages[messages.length - 1];
    const isIncoming =
      last.mine !== true &&
      Boolean(currentViewerId) &&
      isIncomingMessageFromDoc(
        {
          fromUid: last.fromUid,
          senderKind: last.senderKind,
        },
        currentViewerId,
        firebaseUid,
        chat,
      );

    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      if (isIncoming) lastIncomingIdRef.current = last.id;
      return;
    }

    if (isIncoming && lastIncomingIdRef.current !== last.id) {
      lastIncomingIdRef.current = last.id;
      tryAlertIncomingMessage({
        chatId,
        messageId: last.id,
        incoming: true,
        suppress: false,
        onAlert: () => {
          playIncomingWhipSound();
          notifyIncomingChatMessage({
            title: "Nuevo mensaje",
            body: String(last.text || "").trim(),
          });
        },
      });
    }
  }, [messages, currentViewerId, enabled, chatId, firebaseUid, chat]);
}
