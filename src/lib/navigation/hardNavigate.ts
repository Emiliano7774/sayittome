"use client";

import { isNativeAppShell } from "@/lib/app/nativeShell";
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

export function hardNavigate(path: string) {
  if (typeof window === "undefined") return;

  const target = String(path || "/");
  const targetPath = target.split("?")[0].split("#")[0] || "/";
  const currentPath = window.location.pathname || "/";

  if (targetPath === currentPath && !target.includes("?") && !target.includes("#")) {
    return;
  }

  window.location.assign(target);
}
