"use client";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  hasPendingChatSends,
  waitForPendingChatSends,
} from "@/lib/chat/pendingChatSends";
import { isMainTabHref } from "@/lib/navigation/mainTabs";

const NATIVE_HARD_NAV_PREFIXES = [
  "/shuffle",
  "/stories/new",
  "/register",
  "/login",
] as const;

export function shouldHardNavigatePath(path: string) {
  const normalized = String(path || "/").split("?")[0].split("#")[0] || "/";
  if (isMainTabHref(normalized)) return true;
  return NATIVE_HARD_NAV_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function shouldHardNavigate() {
  return isNativeAppShell();
}

let queuedHardNavigation: string | null = null;

export function hardNavigate(path: string) {
  if (typeof window === "undefined") return;

  const target = String(path || "/");
  const targetPath = target.split("?")[0].split("#")[0] || "/";
  const currentPath = window.location.pathname || "/";

  if (targetPath === currentPath && !target.includes("?") && !target.includes("#")) {
    return;
  }

  const assign = () => {
    window.location.assign(target);
  };

  if (!hasPendingChatSends()) {
    queuedHardNavigation = null;
    assign();
    return;
  }

  // A second tap for the same target must not schedule a second load.
  if (queuedHardNavigation === target) return;
  queuedHardNavigation = target;
  void waitForPendingChatSends().finally(() => {
    if (queuedHardNavigation !== target) return;
    queuedHardNavigation = null;
    assign();
  });
}
