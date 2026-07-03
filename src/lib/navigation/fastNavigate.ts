"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { recordPathBeforeChatOpen } from "@/lib/navigation/chatBackNavigation";
import { runNativeViewTransition } from "@/lib/navigation/nativeNavigate";

function normalizeChatHref(href: string) {
  const path = href.split("?")[0].split("#")[0];
  return path.startsWith("/chat/") && path !== "/chat/new";
}

export function fastRouterPush(router: AppRouterInstance, href: string) {
  if (normalizeChatHref(href)) {
    recordPathBeforeChatOpen();
  }

  runNativeViewTransition(() => {
    router.push(href);
  });
}

export function fastRouterReplace(router: AppRouterInstance, href: string) {
  runNativeViewTransition(() => {
    router.replace(href);
  });
}
