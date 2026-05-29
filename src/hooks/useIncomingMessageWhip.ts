"use client";

import { useEffect, useRef } from "react";

import { bindWhipSoundUnlock, notifyIncomingChatMessage, playIncomingWhipSound } from "@/lib/chat/whipSound";

type IncomingMessage = {
  id: string;
  mine?: boolean;
  fromUid?: string;
  text?: string;
};

export function useIncomingMessageWhip(
  messages: IncomingMessage[],
  currentViewerId: string,
  enabled = true,
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
      (!last.fromUid || String(last.fromUid) !== currentViewerId);

    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      if (isIncoming) lastIncomingIdRef.current = last.id;
      return;
    }

    if (isIncoming && lastIncomingIdRef.current !== last.id) {
      lastIncomingIdRef.current = last.id;
      playIncomingWhipSound();
      notifyIncomingChatMessage({
        title: "Nuevo mensaje",
        body: String(last.text || "").trim(),
      });
    }
  }, [messages, currentViewerId, enabled]);
}
