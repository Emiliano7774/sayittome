"use client";

import { AlertCircle, Check, CheckCheck, Loader2 } from "lucide-react";

import type { MessageReceiptStatus } from "@/lib/chat/messageReceipt";

type Props = {
  status: MessageReceiptStatus;
  align?: "left" | "right";
  className?: string;
};

export default function ChatMessageReceipt({
  status,
  align = "right",
  className = "",
}: Props) {
  const alignClass = align === "right" ? "justify-end" : "justify-start";

  if (status === "error") {
    return (
      <div className={`mt-1 flex ${alignClass} ${className}`} aria-label="Error">
        <AlertCircle size={14} className="text-red-400" strokeWidth={2.5} />
      </div>
    );
  }

  if (status === "sending") {
    return (
      <div className={`mt-1 flex ${alignClass} ${className}`} aria-label="Enviando">
        <Check size={14} className="text-white/30" strokeWidth={2.5} />
      </div>
    );
  }

  if (status === "seen") {
    return (
      <div className={`mt-1 flex ${alignClass} ${className}`} aria-label="Visto">
        <CheckCheck size={15} className="text-violet-400" strokeWidth={2.5} />
      </div>
    );
  }

  if (status === "delivered") {
    return (
      <div className={`mt-1 flex ${alignClass} ${className}`} aria-label="Entregado">
        <CheckCheck size={15} className="text-white/35" strokeWidth={2.5} />
      </div>
    );
  }

  return (
    <div className={`mt-1 flex ${alignClass} ${className}`} aria-label="Enviando">
      <Loader2 size={13} className="animate-spin text-white/30" strokeWidth={2.5} />
    </div>
  );
}
