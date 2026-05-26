"use client";

import { useEffect, useRef } from "react";

import { bindWhipSoundUnlock, playIncomingWhipSound } from "@/lib/chat/whipSound";

type IncomingMessage = {
  id: string;
  mine?: boolean;
  fromUid?: string;
};

export function useIncomingMessageWhip(
  messages: IncomingMessage[],
  currentSenderId: string,
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
      (!last.fromUid || String(last.fromUid) !== currentSenderId);

    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      if (isIncoming) lastIncomingIdRef.current = last.id;
      return;
    }

    if (isIncoming && lastIncomingIdRef.current !== last.id) {
      lastIncomingIdRef.current = last.id;
      playIncomingWhipSound();
    }
  }, [messages, currentSenderId, enabled]);
}
