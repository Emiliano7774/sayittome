"use client";

import { Circle, MessageSquare, Rocket, Shuffle, User } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import BottomNavLink from "@/components/navigation/BottomNavLink";
import { useT } from "@/contexts/LocaleContext";
import { fastRouterPush } from "@/lib/navigation/fastNavigate";
import { resolveEffectiveMainTab } from "@/lib/navigation/mainTabKeepAlive";
import {
  getCurrentMainTabPathname,
  getMainTabInternalPathnameVersion,
  subscribeMainTabPathname,
} from "@/lib/navigation/mainTabInternalPathnameStore";
import { canSelectBottomNavMainTab } from "@/lib/navigation/routeKind";
import {
  beginWarmShuffleTabNavigation,
  completeWarmShuffleTabNavigation,
  prepareMainTabToShuffleNavigation,
} from "@/lib/navigation/warmShuffleTabNavigation";
import { blockMainTabNavigationDuringSlide, getMainTabToShufflePhase } from "@/lib/navigation/mainTabToShuffleTransition";
import { triggerShuffleClick } from "@/lib/shuffle/shuffleClickBridge";
import ChatPendingIndicator from "@/components/chat/ChatPendingIndicator";

type NavItem =
  | { id: string; kind: "link"; href: string; icon: typeof Circle }
  | { id: string; kind: "boost"; href: string; icon: typeof Rocket }
  | { id: string; kind: "shuffle"; href: string; icon: typeof Shuffle };

type Props = {
  unreadCount?: number;
};

export default function ModernBottomNav({ unreadCount = 0 }: Props) {
  const nextPathname = usePathname();
  useSyncExternalStore(
    subscribeMainTabPathname,
    getMainTabInternalPathnameVersion,
    getMainTabInternalPathnameVersion,
  );
  const pathname = getCurrentMainTabPathname(nextPathname);
  const navSelectable = canSelectBottomNavMainTab(pathname);
  const effectiveTab = navSelectable ? resolveEffectiveMainTab(pathname) : "";
  const router = useRouter();
  const t = useT();

  const items: NavItem[] = [
    { id: "stories", kind: "link", href: "/stories", icon: Circle },
    { id: "chats", kind: "link", href: "/chats", icon: MessageSquare },
    { id: "shuffle", kind: "shuffle", href: "/shuffle", icon: Shuffle },
    { id: "boost", kind: "boost", href: "/boost", icon: Rocket },
    { id: "settings", kind: "link", href: "/settings", icon: User },
  ];

  function dispatchShuffle() {
    triggerShuffleClick();
  }

  function openShuffleTab() {
    if (blockMainTabNavigationDuringSlide()) return;
    if (getMainTabToShufflePhase() !== "preparing") {
      beginWarmShuffleTabNavigation(pathname, { triggerType: "user-main-tab-click" });
    }
    completeWarmShuffleTabNavigation(router, fastRouterPush, pathname);
  }

  function warmShuffleTabPointerDown() {
    if (blockMainTabNavigationDuringSlide()) {
      prepareMainTabToShuffleNavigation(pathname, {
        blockedDuringSlide: true,
        triggerType: "user-main-tab-pointerdown",
      });
      return;
    }
    if (pathname !== "/shuffle") {
      prepareMainTabToShuffleNavigation(pathname, { triggerType: "user-main-tab-pointerdown" });
    }
  }

  function warmShuffleTabPointerEnter() {
    // Keepalive warm only — never begin micro-slide from hover/remount after popstate.
    if (blockMainTabNavigationDuringSlide()) {
      prepareMainTabToShuffleNavigation(pathname, {
        blockedDuringSlide: true,
        triggerType: "pointerenter-warm",
      });
      return;
    }
    if (pathname !== "/shuffle") {
      prepareMainTabToShuffleNavigation(pathname, { triggerType: "pointerenter-warm" });
    }
  }

  return (
    <div
      className="sayittome-bottom-nav sayittome-glass-bar fixed inset-x-0 bottom-0 z-[9999]"
      data-bottom-nav-implementation="modern"
    >
      <div className="sayittome-bottom-nav-inner flex w-full items-center justify-around px-[max(22px,4vw)]">
        {items.map((item) => {
          const Icon = item.icon;

          if (item.kind === "boost") {
            const active = effectiveTab === item.href || effectiveTab.startsWith(`${item.href}/`);

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

          if (item.kind === "shuffle" && !(navSelectable && pathname === "/shuffle")) {
            return (
              <button
                key={item.id}
                type="button"
                data-nav-tab="shuffle"
                onPointerDown={warmShuffleTabPointerDown}
                onPointerEnter={warmShuffleTabPointerEnter}
                onClick={openShuffleTab}
                className="flex h-full flex-1 appearance-none items-center justify-center border-0 bg-transparent p-0"
                aria-label={t("nav_shuffle_refresh")}
              >
                <Icon
                  size={34}
                  strokeWidth={2.35}
                  className="block shrink-0 translate-x-px -translate-y-px text-[#777]"
                />
              </button>
            );
          }

          if (item.kind === "shuffle" && navSelectable && pathname === "/shuffle") {
            return (
              <button
                key={item.id}
                type="button"
                onClick={dispatchShuffle}
                className="flex h-full flex-1 appearance-none items-center justify-center border-0 bg-transparent p-0"
                aria-label={t("nav_shuffle_refresh")}
              >
                <span className="flex h-10 w-10 items-center justify-center">
                  <Icon
                    size={34}
                    strokeWidth={2.35}
                    className="block shrink-0 translate-x-px -translate-y-px text-[#7b5cff]"
                  />
                </span>
              </button>
            );
          }

          const active = effectiveTab === item.href || effectiveTab.startsWith(`${item.href}/`);

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
              {unreadCount > 0 && item.id === "chats" ? (
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
