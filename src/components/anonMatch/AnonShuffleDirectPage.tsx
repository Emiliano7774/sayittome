"use client";

import { useEffect, useRef } from "react";
import AnonDirectChatWindow from "@/components/anonMatch/AnonDirectChatWindow";
import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";

/** Full-page, conventional chat UI for a direct anonymous Shuffle DM.
 * Random matching continues to use its separate floating component. */
export default function AnonShuffleDirectPage({ chatId }: { chatId: string }) {
  const match = useAnonMatchOptional();
  const bootedRef = useRef("");
  useEffect(() => {
    if (!match || bootedRef.current === chatId) return;
    bootedRef.current = chatId;
    if (match.openChat?.chatId !== chatId) {
      void match.openDirectChat(chatId, "anonimo");
    }
  }, [chatId, match]);

  return <AnonDirectChatWindow pageMode pageChatId={chatId} />;
}
