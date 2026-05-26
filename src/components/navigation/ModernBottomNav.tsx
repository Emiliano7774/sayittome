"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Circle, MessageSquare, Rocket, Shuffle, User } from "lucide-react";

const ITEMS = [
  { href: "/stories", icon: Circle, label: "Historias" },
  { href: "/chats", icon: MessageSquare, label: "Chats" },
  { href: "/shuffle", icon: Shuffle, label: "Shuffle", shuffle: true },
  { href: "/stories/new", icon: Rocket, label: "Publicar" },
  { href: "/settings", icon: User, label: "Perfil" },
] as const;

export default function ModernBottomNav() {
  const pathname = usePathname();

  function dispatchShuffle() {
    window.dispatchEvent(new CustomEvent("sayittome:shuffle"));
  }

  return (
    <nav
      className="modern-bottom-nav fixed inset-x-0 bottom-0 z-[9999] px-4 pb-[max(10px,env(safe-area-inset-bottom))] pt-2"
      aria-label="Navegación principal"
    >
      <div className="mx-auto flex h-[68px] max-w-lg items-center justify-around rounded-[28px] border border-white/10 bg-[#0d0d0d]/78 shadow-[0_8px_40px_rgba(0,0,0,.55),0_0_50px_rgba(104,76,255,0.2)] backdrop-blur-2xl supports-[backdrop-filter]:bg-[#0d0d0d]/65">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/shuffle" && pathname.startsWith(`${item.href}/`));

          if ("shuffle" in item && item.shuffle && pathname === "/shuffle") {
            return (
              <button
                key={item.href}
                type="button"
                onClick={dispatchShuffle}
                className="relative flex h-14 w-14 flex-col items-center justify-center"
                aria-label="Cambiar perfiles"
              >
                <Icon size={26} className="text-violet-300" strokeWidth={2.2} />
                {active ? (
                  <span className="absolute -bottom-1 h-1 w-8 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,.8)]" />
                ) : null}
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex h-14 w-14 flex-col items-center justify-center active:scale-95 transition"
              aria-label={item.label}
            >
              <Icon
                size={24}
                strokeWidth={2.2}
                className={active ? "text-violet-300" : "text-white/40"}
              />
              {active ? (
                <span className="absolute -bottom-1 h-1 w-7 rounded-full bg-violet-400/90 shadow-[0_0_10px_rgba(167,139,250,.7)]" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
