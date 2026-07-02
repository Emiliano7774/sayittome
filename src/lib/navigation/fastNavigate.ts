"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { runNativeViewTransition } from "@/lib/navigation/nativeNavigate";

export function fastRouterPush(router: AppRouterInstance, href: string) {
  runNativeViewTransition(() => {
    router.push(href);
  });
}

export function fastRouterReplace(router: AppRouterInstance, href: string) {
  runNativeViewTransition(() => {
    router.replace(href);
  });
}
