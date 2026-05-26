"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Circle, MessageSquare, Rocket, Shuffle, User } from "lucide-react";

import { useT } from "@/contexts/LocaleContext";

export default function BottomNav() {
  const pathname = usePathname();
  const t = useT();

  const items = [
    { href: "/stories", icon: Circle },
    { href: "/chats", icon: MessageSquare },
    { href: "/shuffle", icon: Shuffle },
    { href: "/stories", icon: Rocket },
    { href: "/settings", icon: User },
  ];

  function dispatchShuffle() {
    window.dispatchEvent(new CustomEvent("sayittome:shuffle"));
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] h-[74px] border-t border-white/[0.04] bg-[#171717]/96 backdrop-blur-2xl">
      <div className="flex h-full w-full items-center justify-around px-[max(22px,4vw)]">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");

          if (item.href === "/shuffle" && pathname === "/shuffle") {
            return (
              <button
                key={item.href}
                type="button"
                onClick={dispatchShuffle}
                className="flex h-full flex-1 items-center justify-center"
                aria-label={t("nav_shuffle_refresh")}
              >
                <Icon size={38} strokeWidth={2.4} className="text-[#7b5cff]" />
              </button>
            );
          }

          return (
            <Link key={item.href} href={item.href} className="flex h-full flex-1 items-center justify-center">
              <Icon
                size={item.href === "/shuffle" ? 38 : 31}
                strokeWidth={2.4}
                className={active ? "text-[#7b5cff]" : "text-[#777]"}
              />
            </Link>
          );
        })}
      </div>

      <div className="pointer-events-none absolute bottom-[6px] left-1/2 h-[4px] w-[118px] -translate-x-1/2 rounded-full bg-white/70" />
    </div>
  );
}
