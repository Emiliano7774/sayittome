"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Circle, MessageSquare, Rocket, Shuffle, User } from "lucide-react";

import ChatPendingIndicator from "@/components/chat/ChatPendingIndicator";
import { useT } from "@/contexts/LocaleContext";

type NavItem =
  | { id: string; kind: "link"; href: string; icon: typeof Circle; badge?: number }
  | { id: string; kind: "boost"; href: string; icon: typeof Rocket }
  | { id: string; kind: "shuffle"; href: string; icon: typeof Shuffle };

type Props = {
  unreadCount?: number;
};

export default function BottomNav({ unreadCount = 0 }: Props) {
  const pathname = usePathname();
  const t = useT();

  const items: NavItem[] = [
    { id: "stories", kind: "link", href: "/stories", icon: Circle },
    { id: "chats", kind: "link", href: "/chats", icon: MessageSquare, badge: unreadCount },
    { id: "shuffle", kind: "shuffle", href: "/shuffle", icon: Shuffle },
    { id: "boost", kind: "boost", href: "/boost", icon: Rocket },
    { id: "settings", kind: "link", href: "/settings", icon: User },
  ];

  function dispatchShuffle() {
    window.dispatchEvent(new CustomEvent("sayittome:shuffle"));
  }

  return (
    <div className="sayittome-bottom-nav sayittome-glass-bar-classic fixed inset-x-0 bottom-0 z-[9999]">
      <div className="sayittome-bottom-nav-inner flex w-full items-center justify-around px-[max(22px,4vw)]">
        {items.map((item) => {
          const Icon = item.icon;

          if (item.kind === "boost") {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
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
              </Link>
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
            <Link
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
            </Link>
          );
        })}
      </div>
    </div>
  );
}
