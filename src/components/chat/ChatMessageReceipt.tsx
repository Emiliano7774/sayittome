"use client";

import { useT } from "@/contexts/LocaleContext";
import type { MessageReceiptStatus } from "@/lib/chat/messageReceipt";

type Props = {
  status: MessageReceiptStatus;
  align?: "left" | "right";
  className?: string;
};

const LABEL_KEY: Record<
  MessageReceiptStatus,
  "chat_status_sending" | "chat_status_delivered" | "chat_status_seen" | "chat_status_error"
> = {
  sending: "chat_status_sending",
  delivered: "chat_status_delivered",
  seen: "chat_status_seen",
  error: "chat_status_error",
};

export default function ChatMessageReceipt({
  status,
  align = "right",
  className = "",
}: Props) {
  const t = useT();

  return (
    <p
      className={[
        "mt-1 text-[11px] font-black uppercase tracking-[0.14em]",
        status === "seen" || status === "delivered"
          ? "text-violet-400"
          : status === "error"
            ? "text-red-400"
            : "text-violet-300/70",
        align === "right" ? "text-right" : "text-left",
        className,
      ].join(" ")}
    >
      {t(LABEL_KEY[status])}
    </p>
  );
}
