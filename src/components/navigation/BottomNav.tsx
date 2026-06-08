"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Circle, MessageSquare, Rocket, Shuffle, User } from "lucide-react";

import { useT } from "@/contexts/LocaleContext";

type Props = {
  unreadCount?: number;
};

export default function BottomNav({ unreadCount = 0 }: Props) {
  const pathname = usePathname();
  const t = useT();

  const items = [
    { href: "/stories", icon: Circle },
    { href: "/chats", icon: MessageSquare, badge: unreadCount },
    { href: "/shuffle", icon: Shuffle },
    { href: "/stories", icon: Rocket },
    { href: "/settings", icon: User },
  ];

  function dispatchShuffle() {
    window.dispatchEvent(new CustomEvent("sayittome:shuffle"));
  }

  return (
    <div className="sayittome-bottom-nav fixed inset-x-0 bottom-0 z-[9999] border-t border-white/[0.04] backdrop-blur-2xl">
      <div className="sayittome-bottom-nav-inner flex w-full items-center justify-around px-[max(22px,4vw)]">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const badge = item.badge || 0;

          if (item.href === "/shuffle" && pathname === "/shuffle") {
            return (
              <button
                key={item.href}
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

          return (
            <Link key={item.href} href={item.href} className="relative flex h-full flex-1 items-center justify-center">
              <Icon
                size={item.href === "/shuffle" ? 38 : 31}
                strokeWidth={2.4}
                className={active ? "text-[#7b5cff]" : "text-[#777]"}
              />
              {badge > 0 && item.href === "/chats" ? (
                <span className="absolute right-[calc(50%-24px)] top-[14px] min-w-[18px] rounded-full border border-orange-300/40 bg-gradient-to-br from-orange-500 to-amber-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow-[0_0_18px_rgba(249,115,22,0.55)]">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <div className="pointer-events-none absolute bottom-[6px] left-1/2 h-[4px] w-[118px] -translate-x-1/2 rounded-full bg-white/70" />
    </div>
  );
}
