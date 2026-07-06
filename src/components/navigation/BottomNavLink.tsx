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
  beginShuffleWarmHandoff,
  isShuffleKeepAliveActive,
  pinShuffleKeepAlive,
  pinShuffleWindowWhileAway,
} from "@/lib/navigation/shuffleKeepAlive";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import {
  ghostFrameWatchBegin,
  ghostFrameWatchInspect,
} from "@/lib/perf/ghostFrameTrace";

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

      if (href === "/shuffle" && currentPath !== "/shuffle" && isShuffleKeepAliveActive()) {
        if (isNavTraceEnabled()) {
          ghostFrameWatchBegin(`warm:${currentPath}->/shuffle`);
          ghostFrameWatchInspect("pointerdown-prepare");
        }
        beginShuffleWarmHandoff(currentPath);
      }

      if (currentPath === "/shuffle" && href !== "/shuffle") {
        pinShuffleKeepAlive();
        pinShuffleWindowWhileAway();
      }
    }

    if (isMainTabHref(href) && href !== "/shuffle") {
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
