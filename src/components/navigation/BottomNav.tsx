"use client";

import { Circle, MessageSquare, Rocket, Shuffle, User } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import BottomNavLink from "@/components/navigation/BottomNavLink";
import ChatPendingIndicator from "@/components/chat/ChatPendingIndicator";
import { useT } from "@/contexts/LocaleContext";
import { fastRouterPush } from "@/lib/navigation/fastNavigate";
import { triggerShuffleClick } from "@/lib/shuffle/shuffleClickBridge";

type NavItem =
  | { id: string; kind: "link"; href: string; icon: typeof Circle; badge?: number }
  | { id: string; kind: "boost"; href: string; icon: typeof Rocket }
  | { id: string; kind: "shuffle"; href: string; icon: typeof Shuffle };

type Props = {
  unreadCount?: number;
};

export default function BottomNav({ unreadCount = 0 }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();

  const items: NavItem[] = [
    { id: "stories", kind: "link", href: "/stories", icon: Circle },
    { id: "chats", kind: "link", href: "/chats", icon: MessageSquare, badge: unreadCount },
    { id: "shuffle", kind: "shuffle", href: "/shuffle", icon: Shuffle },
    { id: "boost", kind: "boost", href: "/boost", icon: Rocket },
    { id: "settings", kind: "link", href: "/settings", icon: User },
  ];

  function dispatchShuffle() {
    triggerShuffleClick();
  }

  function openShuffleTab() {
    fastRouterPush(router, "/shuffle");
    triggerShuffleClick();
  }

  return (
    <div className="sayittome-bottom-nav fixed bottom-0 left-0 right-0 z-[9999] border-t border-white/[0.04] bg-[#171717]/96 backdrop-blur-2xl">
      <div className="sayittome-bottom-nav-inner flex w-full items-center justify-around px-[max(22px,4vw)]">
        {items.map((item) => {
          const Icon = item.icon;

          if (item.kind === "boost") {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <BottomNavLink
                key={item.id}
                href={item.href}
                className="relative flex h-full flex-1 items-center justify-center"
                aria-label={t("boost_nav_label")}
              >
                <Icon
                  size={31}
                  strokeWidth={2.4}
                  className={active ? "text-[#f59e0b]" : "text-[#777]"}
                />
              </BottomNavLink>
            );
          }

          if (item.kind === "shuffle" && pathname !== "/shuffle") {
            return (
              <button
                key={item.id}
                type="button"
                onClick={openShuffleTab}
                className="flex h-full flex-1 appearance-none items-center justify-center border-0 bg-transparent p-0"
                aria-label={t("nav_shuffle_refresh")}
              >
                <Icon
                  size={38}
                  strokeWidth={2.4}
                  className="text-[#777]"
                />
              </button>
            );
          }

          if (item.kind === "shuffle" && pathname === "/shuffle") {
            return (
              <button
                key={item.id}
                type="button"
                onClick={dispatchShuffle}
                className="flex h-full flex-1 appearance-none items-center justify-center border-0 bg-transparent p-0"
                aria-label={t("nav_shuffle_refresh")}
              >
                <span className="flex h-10 w-10 items-center justify-center">
                  <Icon size={38} strokeWidth={2.4} className="text-[#7b5cff]" />
                </span>
              </button>
            );
          }

          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const badge = item.kind === "link" ? item.badge || 0 : 0;

          return (
            <BottomNavLink
              key={item.id}
              href={item.href}
              className="relative flex h-full flex-1 items-center justify-center"
            >
              <Icon
                size={item.kind === "shuffle" ? 38 : 31}
                strokeWidth={2.4}
                className={active ? "text-[#7b5cff]" : "text-[#777]"}
              />
              {badge > 0 && item.id === "chats" ? (
                <ChatPendingIndicator className="right-[calc(50%-18px)] top-[11px]" />
              ) : null}
            </BottomNavLink>
          );
        })}
      </div>

      <div className="pointer-events-none absolute bottom-[6px] left-1/2 h-[4px] w-[118px] -translate-x-1/2 rounded-full bg-white/70" />
    </div>
  );
}
