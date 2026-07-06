"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { recordPathBeforeChatOpen } from "@/lib/navigation/chatBackNavigation";
import { isNavTraceEnabled, navTraceMark } from "@/lib/perf/navTrace";
import {
  clearInstantShuffleReturn,
  commitShuffleTabReturn,
  isInstantShuffleReturnDestination,
  maybePinShuffleKeepAliveFromPath,
  pinShuffleWindowWhileAway,
  prepareInstantShuffleReturn,
} from "@/lib/navigation/shuffleKeepAlive";

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

    if (currentPath === "/shuffle") {
      pinShuffleWindowWhileAway();
    }

    if (isInstantShuffleReturnDestination(href)) {
      commitShuffleTabReturn();
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

  if (isInstantShuffleReturnDestination(href)) {
    prepareInstantShuffleReturn();
    router.replace(href);
    return;
  }

  clearInstantShuffleReturn();
  router.replace(href);
}
