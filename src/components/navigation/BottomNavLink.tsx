"use client";

import Link from "next/link";
import { useRef } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  hasPendingChatSends,
  waitForPendingChatSends,
} from "@/lib/chat/pendingChatSends";
import { fastMainTabHistoryPush } from "@/lib/navigation/fastNavigate";
import {
  armIncomingBarTab,
  markMainTabVisited,
  pinMainTabKeepAlive,
} from "@/lib/navigation/mainTabKeepAlive";
import { isMainTabHref } from "@/lib/navigation/mainTabs";
import {
  beginShuffleWarmHandoff,
  pinShuffleKeepAlive,
  pinShuffleWindowWhileAway,
} from "@/lib/navigation/shuffleKeepAlive";
import {
  clearStaleShuffleEntryHandoffForMainTabDestination,
} from "@/lib/navigation/shuffleHandoffState";
import {
  abortMainTabToShuffleTransition,
  blockMainTabNavigationDuringSlide,
  cancelPendingShuffleRouteCommits,
  isInternalMainTabToShuffleTransitionActive,
  noteConcreteMainTabSupersede,
} from "@/lib/navigation/mainTabToShuffleTransition";
import type { MainTabHref } from "@/lib/navigation/mainTabs";
import { presentNativeBarSectionNow } from "@/lib/navigation/stuckTabSurfaceReconcile";
import { isTabShellNoLoadingTransitionContractActive } from "@/lib/navigation/tabDestinationReadiness";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import {
  ghostFrameWatchBegin,
  ghostFrameWatchInspect,
} from "@/lib/perf/ghostFrameTrace";
import { writeChatsPrepaintHandoffMarker } from "@/lib/chats/chatsPrepaintHandoff";
import { armChatsSequenceHandoffSuppress } from "@/lib/chats/chatsHandoffSuppress";
import { writeBoostPrepaintHandoffMarker } from "@/lib/boost/boostPrepaintHandoff";
import { armBoostSequenceHandoffSuppress } from "@/lib/boost/boostHandoffSuppress";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
};

function isConcreteMainTabHref(href: string) {
  return isMainTabHref(href) && href !== "/shuffle";
}

/** Main tabs navigate via real routes; keep-alive hosts preserve mounted panels. */
export default function BottomNavLink({ href, className, children, ...rest }: Props) {
  // Main tabs use same-document history commits. Besides preserving keep-alive,
  // this avoids Firebase Hosting's production RSC->HTML fallback on static tabs.
  const forceSoftMainTabNav = isMainTabHref(href);
  /** Set when pointerdown already committed a soft push during an active slide. */
  const softPushFromPointerDownRef = useRef<string | null>(null);
  const deferredMainTabRef = useRef<string | null>(null);

  function scheduleMainTabHistory(hrefTo: string, reason: string) {
    if (!hasPendingChatSends()) {
      deferredMainTabRef.current = null;
      fastMainTabHistoryPush(hrefTo, reason);
      return;
    }
    if (deferredMainTabRef.current === hrefTo) return;
    deferredMainTabRef.current = hrefTo;
    void waitForPendingChatSends().finally(() => {
      if (deferredMainTabRef.current !== hrefTo) return;
      deferredMainTabRef.current = null;
      fastMainTabHistoryPush(hrefTo, reason);
    });
  }

  function supersedeInFlightShuffle(reason: string) {
    noteConcreteMainTabSupersede(href);
    cancelPendingShuffleRouteCommits(reason);
    const wasInFlightShuffle =
      blockMainTabNavigationDuringSlide() ||
      isInternalMainTabToShuffleTransitionActive();
    if (wasInFlightShuffle) {
      abortMainTabToShuffleTransition(reason);
    }
    // Concrete main-tab destinations must neutralize entry handoff leftovers in
    // the same pointerdown turn. Stories has no Chats/Boost post-auth settle CSS,
    // so promote Shuffle→Stories (mid-slide or settled) to an exit latch until
    // Stories is no-loading ready.
    if (isConcreteMainTabHref(href)) {
      clearStaleShuffleEntryHandoffForMainTabDestination(
        href as Exclude<MainTabHref, "/shuffle">,
      );
    }
  }

  function warmTab(options?: { allowSupersede?: boolean }) {
    const allowSupersede = options?.allowSupersede === true;
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname.split("?")[0].split("#")[0];
      const concreteMainTabDestination = isConcreteMainTabHref(href);

      // Concrete main-tab destinations must win over an in-flight micro-slide.
      // Only supersede on pointerdown/click — never on pointerenter hover.
      if (concreteMainTabDestination && allowSupersede) {
        supersedeInFlightShuffle("navigation-replaced");
      } else if (!concreteMainTabDestination && blockMainTabNavigationDuringSlide()) {
        return;
      }

      if (
        allowSupersede &&
        href !== "/shuffle" &&
        isInternalMainTabToShuffleTransitionActive()
      ) {
        abortMainTabToShuffleTransition("navigation-replaced");
      }

      if (href === "/shuffle" && currentPath !== "/shuffle") {
        pinShuffleKeepAlive();
        // Arm micro-slide + entry handoff only on pointerdown/click intent.
        // pointerenter hover used to beginShuffleWarmHandoff while still on
        // /stories|/chats, leaving sayittome-shuffle-handoff-pending stuck after
        // Stories stay samples (FROM_CHATS_SHUFFLE_TO_STORIES handoffFinal).
        if (allowSupersede && !isNativeAppShell()) {
          if (isNavTraceEnabled()) {
            ghostFrameWatchBegin(`warm:${currentPath}->/shuffle`);
            ghostFrameWatchInspect("pointerdown-prepare");
          }
          beginShuffleWarmHandoff(currentPath);
        }
      }

      if (currentPath === "/shuffle" && href !== "/shuffle") {
        pinShuffleKeepAlive();
        pinShuffleWindowWhileAway();
        if (isMainTabHref(href)) {
          pinMainTabKeepAlive();
          markMainTabVisited(href);
        }
        // Pre-paint: Shuffle→Chats / Shuffle→Boost must arm session+DOM suppress
        // before SoftNavigate can destroy the heap — React effects / module
        // hydrate are too late (targeted sequence after Chats remount).
        if (
          href === "/chats" &&
          isTabShellNoLoadingTransitionContractActive()
        ) {
          writeChatsPrepaintHandoffMarker({ from: "/shuffle" });
          armChatsSequenceHandoffSuppress(520, { from: "/shuffle" });
        }
        if (
          href === "/boost" &&
          isTabShellNoLoadingTransitionContractActive()
        ) {
          writeBoostPrepaintHandoffMarker({ from: "/shuffle" });
          armBoostSequenceHandoffSuppress(520, { from: "/shuffle" });
        }
      }
    }

    if (isMainTabHref(href) && href !== "/shuffle") {
      pinMainTabKeepAlive();
      markMainTabVisited(href);
    }
  }

  function commitConcreteMainTabHistory(hrefTo: string) {
    supersedeInFlightShuffle("navigation-replaced");
    softPushFromPointerDownRef.current = hrefTo;
    scheduleMainTabHistory(hrefTo, "bottom-nav-pointerdown-history");
  }

  function paintBarSection(hrefTo: string) {
    if (!isMainTabHref(hrefTo)) return;
    armIncomingBarTab(hrefTo);
    presentNativeBarSectionNow(hrefTo);
  }

  function onPointerDown() {
    if (!forceSoftMainTabNav || !isConcreteMainTabHref(href)) {
      warmTab({ allowSupersede: true });
      return;
    }
    // Capture handoff state BEFORE warm/abort — abort clears sliding/active.
    // During an active micro-slide the nav hit-target can briefly collapse
    // (0×0) and the subsequent click never fires. Commit on pointerdown so the
    // Stories/Chats/Boost/Settings tap cannot be swallowed.
    warmTab({ allowSupersede: true });
    paintBarSection(href);
    commitConcreteMainTabHistory(href);
  }

  function onMainTabClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!forceSoftMainTabNav) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();

    const concreteMainTabDestination = isConcreteMainTabHref(href);
    const livePath =
      typeof window !== "undefined"
        ? window.location.pathname.split("?")[0].split("#")[0]
        : "";

    // Re-tapping the current tab is a no-op; do not create duplicate history.
    if (livePath === href) {
      softPushFromPointerDownRef.current = null;
      return;
    }

    if (
      concreteMainTabDestination &&
      softPushFromPointerDownRef.current === href
    ) {
      softPushFromPointerDownRef.current = null;
      supersedeInFlightShuffle("navigation-replaced");
      if (livePath !== href) {
        scheduleMainTabHistory(href, "bottom-nav-pointerdown-reconcile");
      }
      return;
    }

    // Abort any in-flight Shuffle slide before the history commit so a late
    // deferred /shuffle commit cannot overwrite the selected concrete tab.
    if (concreteMainTabDestination) {
      supersedeInFlightShuffle("navigation-replaced");
    }
    warmTab({ allowSupersede: true });
    if (!concreteMainTabDestination && blockMainTabNavigationDuringSlide()) {
      return;
    }
    if (concreteMainTabDestination) {
      supersedeInFlightShuffle("navigation-replaced");
    }

    scheduleMainTabHistory(href, "bottom-nav-main-tab-history");
    paintBarSection(href);
  }

  if (forceSoftMainTabNav) {
    return (
      <a
        role="button"
        tabIndex={0}
        data-nav-tab={href}
        className={className}
        onPointerDown={onPointerDown}
        onPointerEnter={() => warmTab()}
        onClick={onMainTabClick}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.currentTarget.click();
        }}
        {...rest}
      >
        {children}
      </a>
    );
  }

  if (isNativeAppShell()) {
    return (
      <a
        href={href}
        className={className}
        onPointerDown={onPointerDown}
        onPointerEnter={() => warmTab()}
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
      onPointerDown={onPointerDown}
      onPointerEnter={() => warmTab()}
      {...rest}
    >
      {children}
    </Link>
  );
}
