"use client";

import type { ReactNode } from "react";
import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";
import type { AnonDirectInboxChat } from "@/lib/anonMatch/anonDirectInboxBridge";

export default function AnonDirectInboxButton({
  chat,
  children,
  className,
}: {
  chat: AnonDirectInboxChat;
  children: ReactNode;
  className: string;
}) {
  const match = useAnonMatchOptional();
  return (
    <button
      type="button"
      data-nav-chat-row
      className={`${className} text-left`}
      onClick={() => match?.openDirectChat(chat.canonicalChatId || chat.id, chat.anonDirectRole)}
      aria-label="Abrir chat anónimo"
    >
      {children}
    </button>
  );
}
