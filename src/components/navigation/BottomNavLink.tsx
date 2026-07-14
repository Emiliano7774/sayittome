"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { isNativeAppShell } from "@/lib/app/nativeShell";
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
import {
  abortMainTabToShuffleTransition,
  beginInternalMainTabToShuffleTransition,
  blockMainTabNavigationDuringSlide,
  isInternalMainTabToShuffleTransitionActive,
  pathToMainTabShuffleSource,
} from "@/lib/navigation/mainTabToShuffleTransition";
import { isTabShellNoLoadingTransitionContractActive } from "@/lib/navigation/tabDestinationReadiness";
import { isMainTabToShuffleMicroSlideEnabled } from "@/lib/perf/instantaneityFlags";
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
  const router = useRouter();
  // Native shell normally uses hard <a> navigations. The bidirectional no-loading
  // contract requires same-document soft nav so keep-alive handoff can freeze source.
  const forceSoftMainTabNav =
    isTabShellNoLoadingTransitionContractActive() && isMainTabHref(href);

  function warmTab() {
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname.split("?")[0].split("#")[0];

      if (blockMainTabNavigationDuringSlide()) {
        return;
      }

      if (href !== "/shuffle" && isInternalMainTabToShuffleTransitionActive()) {
        abortMainTabToShuffleTransition("navigation-replaced");
      }

      if (href === "/shuffle" && currentPath !== "/shuffle") {
        pinShuffleKeepAlive();
        if (isNavTraceEnabled()) {
          ghostFrameWatchBegin(`warm:${currentPath}->/shuffle`);
          ghostFrameWatchInspect("pointerdown-prepare");
        }
        const source = pathToMainTabShuffleSource(currentPath);
        if (isMainTabToShuffleMicroSlideEnabled() && source) {
          beginInternalMainTabToShuffleTransition(source);
        }
        beginShuffleWarmHandoff(currentPath);
      }

      if (currentPath === "/shuffle" && href !== "/shuffle") {
        pinShuffleKeepAlive();
        pinShuffleWindowWhileAway();
        if (isMainTabHref(href)) {
          pinMainTabKeepAlive();
          markMainTabVisited(href);
        }
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

  function onNativeClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!forceSoftMainTabNav) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    warmTab();
    if (blockMainTabNavigationDuringSlide()) return;
    router.push(href);
  }

  if (isNativeAppShell() && !forceSoftMainTabNav) {
    return (
      <a
        href={href}
        className={className}
        onPointerDown={warmTab}
        onPointerEnter={warmTab}
        {...rest}
      >
        {children}
      </a>
    );
  }

  if (isNativeAppShell() && forceSoftMainTabNav) {
    return (
      <a
        href={href}
        className={className}
        onPointerDown={warmTab}
        onPointerEnter={warmTab}
        onClick={onNativeClick}
        {...rest}
      >
        {children}
      </a>
    );
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
