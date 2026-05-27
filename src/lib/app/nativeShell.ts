"use client";

export function isCapacitorNative() {
  if (typeof window === "undefined") return false;

  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;

  return Boolean(capacitor?.isNativePlatform?.());
}

export function isNativeAppShell() {
  if (typeof window === "undefined") return false;

  if (isCapacitorNative()) return true;

  const params = new URLSearchParams(window.location.search);
  if (params.get("native") === "1") return true;

  const ua = navigator.userAgent || "";
  return /SayItToMeApp|wv\)/i.test(ua);
}

export function isAndroidDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}
