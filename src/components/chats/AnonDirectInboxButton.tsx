"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  return (
    <button
      type="button"
      data-nav-chat-row
      className={`${className} text-left`}
      onClick={() => {
        const id = chat.canonicalChatId || chat.id;
        if (id.startsWith("asd_")) {
          router.push(`/chat/${encodeURIComponent(id)}`);
        } else {
          void match?.openDirectChat(id, chat.anonDirectRole);
        }
      }}
      aria-label="Abrir chat anónimo"
    >
      {children}
    </button>
  );
}
