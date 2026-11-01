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
  const warmedAtRef = useRef(0);
  const prefetchedRouteRef = useRef(false);

  // A touch can fire pointerenter -> pointerdown -> click back-to-back.
  // Deduplicate cache-only work and NEVER start a competing route prefetch
  // on a touch: the actual navigation already fetches that route.
  const warmCachedMessages = () => {
    const now = Date.now();
    if (now - warmedAtRef.current < 800) return;
    warmedAtRef.current = now;
    if (chatId) prefetchChatThread(chatId, { cacheOnly: true });
  };

  // Desktop hover gives us time to warm the route before the user clicks.
  const warmDesktopRoute = () => {
    if (prefetchedRouteRef.current) return;
    prefetchedRouteRef.current = true;
    try {
      router.prefetch(href);
    } catch {
      prefetchedRouteRef.current = false;
    }
  };

  const openChat = (title: string) => {
    const now = Date.now();
    if (now - openedAtRef.current < 800) return;
    openedAtRef.current = now;
    warmCachedMessages();
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
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        warmCachedMessages();
        warmDesktopRoute();
      }}
      onFocus={warmCachedMessages}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        warmCachedMessages();
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
