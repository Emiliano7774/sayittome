"use client";

import Link from "next/link";

import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

export default function ChatInboxLink({ href, className, children }: Props) {
  const chatId = decodeURIComponent(href.split("/chat/")[1]?.split("?")[0] || "");

  return (
    <Link
      href={href}
      prefetch
      className={className}
      onPointerEnter={() => {
        if (chatId) prefetchChatThread(chatId);
      }}
      onPointerDown={() => {
        if (chatId) prefetchChatThread(chatId);
      }}
    >
      {children}
    </Link>
  );
}
