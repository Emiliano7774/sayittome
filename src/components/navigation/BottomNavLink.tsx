"use client";

import Link from "next/link";

import {
  hasMainTabBeenVisited,
  markMainTabVisited,
  pinMainTabKeepAlive,
  setPendingVisualTab,
} from "@/lib/navigation/mainTabKeepAlive";
import { isMainTabHref } from "@/lib/navigation/mainTabs";
import {
  pinShuffleKeepAlive,
  pinShuffleWindowWhileAway,
} from "@/lib/navigation/shuffleKeepAlive";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
};

/** Main tabs navigate via real routes; keep-alive hosts preserve mounted panels. */
export default function BottomNavLink({ href, className, children, ...rest }: Props) {
  function warmTab() {
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname.split("?")[0].split("#")[0];
      if (currentPath === "/shuffle" && href !== "/shuffle") {
        pinShuffleKeepAlive();
        pinShuffleWindowWhileAway();
      }
    }

    if (isMainTabHref(href)) {
      const wasVisited = hasMainTabBeenVisited(href);
      pinMainTabKeepAlive();
      markMainTabVisited(href);
      if (wasVisited) {
        setPendingVisualTab(href);
      }
    }
  }

  return (
    <Link
      href={href}
      className={className}
      prefetch
      onPointerDown={warmTab}
      onPointerEnter={warmTab}
      {...rest}
    >
      {children}
    </Link>
  );
}
