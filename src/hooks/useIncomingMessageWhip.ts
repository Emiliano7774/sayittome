"use client";

import { useEffect, useRef } from "react";

import type { InboxChat } from "@/hooks/useChatsInbox";
import { isIncomingChatNotification } from "@/lib/chat/incomingChatNotification";
import {
  isLocalOutgoingClientId,
  isLocalOutgoingMessageId,
  tryAlertIncomingMessage,
} from "@/lib/chat/whipAlertDedupe";
import { bindWhipSoundUnlock, notifyIncomingChatMessage, playIncomingWhipSound } from "@/lib/chat/whipSound";
import { recordQaCriticalEvent } from "@/lib/qa/realDeviceQaDebug";

type IncomingMessage = {
  id: string;
  clientId?: string;
  mine?: boolean;
  fromUid?: string;
  senderKind?: string;
  senderAuthUid?: string;
  createdByAuthUid?: string;
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
    const localOutgoing = isLocalOutgoingClientId(chatId, String(last.clientId || "")) ||
      isLocalOutgoingMessageId(chatId, last.id);
    // Before the profile-anon chat metadata arrives we cannot prove which
    // anonymous author aliases belong to this visitor. Do not convert an
    // uncertain last.mine=false into a local self-notification.
    const identityKnown = !chatId.includes("__anon_to__") || Boolean(chat);
    const isIncoming =
      !localOutgoing &&
      identityKnown &&
      last.mine !== true &&
      Boolean(currentViewerId) &&
      isIncomingChatNotification(
        {
          fromUid: last.fromUid,
          senderKind: last.senderKind,
          senderAuthUid: last.senderAuthUid,
          createdByAuthUid: last.createdByAuthUid,
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
          recordQaCriticalEvent("chat", "CHAT_INBOUND_WHIP_TRIGGERED", {
            threadId: chatId,
            messageId: last.id,
            soundTriggeredAt: Date.now(),
          });
          playIncomingWhipSound();
          notifyIncomingChatMessage({
            title: "Nuevo mensaje",
            body: String(last.text || "").trim() || "Nuevo mensaje",
            chatId,
            messageId: last.id,
            viewingActiveChat: true,
          });
        },
      });
    }
  }, [messages, currentViewerId, enabled, chatId, firebaseUid, chat]);
}
