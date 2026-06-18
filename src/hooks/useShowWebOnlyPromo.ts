"use client";

import { useEffect, useState } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";

/** True on web browsers; false inside the Capacitor APK / WebView shell. */
export function useShowWebOnlyPromo() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(!isNativeAppShell());
  }, []);

  return show;
}
