"use client";

import { isNativeAppShell } from "@/lib/app/nativeShell";

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

export function shouldHardNavigate() {
  return isNativeAppShell();
}
