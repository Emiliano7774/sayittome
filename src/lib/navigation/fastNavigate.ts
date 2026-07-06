"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { recordPathBeforeChatOpen } from "@/lib/navigation/chatBackNavigation";
import {
  isInstantShuffleReturnDestination,
  maybePinShuffleKeepAliveFromPath,
  prepareInstantShuffleReturn,
} from "@/lib/navigation/shuffleKeepAlive";

function normalizeChatHref(href: string) {
  const path = href.split("?")[0].split("#")[0];
  return path.startsWith("/chat/") && path !== "/chat/new";
}

export function fastRouterPush(router: AppRouterInstance, href: string) {
  if (typeof window !== "undefined") {
    maybePinShuffleKeepAliveFromPath(window.location.pathname);
  }

  if (normalizeChatHref(href)) {
    recordPathBeforeChatOpen();
  }

  router.push(href);
}

export function fastRouterReplace(router: AppRouterInstance, href: string) {
  if (isInstantShuffleReturnDestination(href)) {
    prepareInstantShuffleReturn();
    router.replace(href);
    return;
  }

  router.replace(href);
}
