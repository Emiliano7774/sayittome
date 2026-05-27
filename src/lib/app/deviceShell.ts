"use client";

import { isNativeAppShell } from "@/lib/app/nativeShell";

/** Phone browser or Capacitor APK — not desktop/tablet. */
export function isPhoneShell() {
  if (typeof window === "undefined") return false;

  if (isNativeAppShell()) return true;

  const ua = navigator.userAgent || "";

  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return false;
  if (/Android(?!.*Mobile)/i.test(ua)) return false;

  if (/iPhone|iPod|Android.*Mobile|Mobile/i.test(ua)) return true;

  return window.innerWidth < 640 && window.matchMedia("(pointer: coarse)").matches;
}
