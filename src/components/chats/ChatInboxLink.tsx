"use client";

import { useRouter } from "next/navigation";

import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";
import { fastRouterPush } from "@/lib/navigation/fastNavigate";
import { clearMainTabShellOverlay } from "@/lib/navigation/mainTabShellBridge";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
  "data-nav-chat-row"?: boolean;
};

export default function ChatInboxLink({ href, className, children, ...rest }: Props) {
  const router = useRouter();
  const chatId = decodeURIComponent(href.split("/chat/")[1]?.split("?")[0] || "");

  const warmThread = () => {
    if (chatId) prefetchChatThread(chatId);
  };

  const openChat = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    warmThread();
    clearMainTabShellOverlay();
    fastRouterPush(router, href);
  };

  return (
    <a
      href={href}
      className={className}
      {...rest}
      onPointerEnter={warmThread}
      onPointerDown={warmThread}
      onClick={openChat}
    >
      {children}
    </a>
  );
}
