"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

import { presentChatThreadNow } from "@/lib/chat/presentChatThread";
import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";
import { fastRouterPush } from "@/lib/navigation/fastNavigate";
import { clearMainTabShellOverlay } from "@/lib/navigation/mainTabShellBridge";
import { captureChatsListScroll } from "@/lib/navigation/chatsListScrollStore";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
  "data-nav-chat-row"?: boolean;
};

export default function ChatInboxLink({ href, className, children, ...rest }: Props) {
  const router = useRouter();
  const chatId = decodeURIComponent(href.split("/chat/")[1]?.split("?")[0] || "");
  const openedAtRef = useRef(0);

  const warmThread = () => {
    if (chatId) prefetchChatThread(chatId);
    try {
      router.prefetch(href);
    } catch {
      /* prefetch is best-effort */
    }
  };

  const openChat = (title: string) => {
    const now = Date.now();
    if (now - openedAtRef.current < 800) return;
    openedAtRef.current = now;
    warmThread();
    if (chatId) captureChatsListScroll(chatId);
    clearMainTabShellOverlay();
    presentChatThreadNow(href, { title });
    fastRouterPush(router, href);
  };

  const titleFrom = (node: HTMLElement) =>
    node.querySelector("p")?.textContent?.trim() || "";

  return (
    <a
      href={href}
      className={className}
      data-chat-id={chatId || undefined}
      {...rest}
      onPointerEnter={warmThread}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        warmThread();
      }}
      onClick={(event) => {
        event.preventDefault();
        openChat(titleFrom(event.currentTarget));
      }}
    >
      {children}
    </a>
  );
}
