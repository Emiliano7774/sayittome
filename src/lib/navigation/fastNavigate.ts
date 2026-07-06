"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { recordPathBeforeChatOpen } from "@/lib/navigation/chatBackNavigation";
import { isNavTraceEnabled, navTraceMark } from "@/lib/perf/navTrace";
import {
  beginShuffleWarmHandoff,
  clearInstantShuffleReturn,
  isInstantShuffleReturnDestination,
  isShuffleKeepAliveActive,
  maybePinShuffleKeepAliveFromPath,
  pinShuffleWindowWhileAway,
  prepareInstantShuffleReturn,
} from "@/lib/navigation/shuffleKeepAlive";
import {
  ghostFrameWatchBegin,
  ghostFrameWatchInspect,
} from "@/lib/perf/ghostFrameTrace";

function pinShuffleWindowIfNeeded(currentPath: string) {
  if (currentPath === "/shuffle" || isShuffleKeepAliveActive()) {
    pinShuffleWindowWhileAway();
  }
}

function normalizeChatHref(href: string) {
  const path = href.split("?")[0].split("#")[0];
  return path.startsWith("/chat/") && path !== "/chat/new";
}

export function fastRouterPush(router: AppRouterInstance, href: string) {
  if (isNavTraceEnabled()) {
    navTraceMark("nav-start");
  }

  if (typeof window !== "undefined") {
    const currentPath = window.location.pathname.split("?")[0].split("#")[0];
    maybePinShuffleKeepAliveFromPath(currentPath);

    pinShuffleWindowIfNeeded(currentPath);

    if (isInstantShuffleReturnDestination(href)) {
      if (isNavTraceEnabled()) {
        ghostFrameWatchBegin(`warm:${currentPath}->/shuffle`);
        ghostFrameWatchInspect("fast-nav-prepare");
      }
      beginShuffleWarmHandoff(currentPath);
    }
  }

  if (normalizeChatHref(href)) {
    recordPathBeforeChatOpen();
  }

  router.push(href);
}

export function fastRouterReplace(router: AppRouterInstance, href: string) {
  if (isNavTraceEnabled()) {
    navTraceMark("nav-start");
  }

  if (typeof window !== "undefined") {
    const currentPath = window.location.pathname.split("?")[0].split("#")[0];
    pinShuffleWindowIfNeeded(currentPath);
  }

  if (isInstantShuffleReturnDestination(href)) {
    prepareInstantShuffleReturn();
    router.replace(href);
    return;
  }

  if (!isShuffleKeepAliveActive()) {
    clearInstantShuffleReturn();
  }

  router.replace(href);
}
