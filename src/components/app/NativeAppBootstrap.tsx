"use client";

import { useEffect } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import { globalChatWhipManager } from "@/lib/chat/globalChatWhipManager";
import { unlockWhipSound } from "@/lib/chat/whipSound";

export default function NativeAppBootstrap() {
  useEffect(() => {
    if (!isNativeAppShell()) return;

    document.documentElement.classList.add("sayittome-native-shell");
    document.body.classList.add("sayittome-native-shell");

    void (async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        // Ignore when not running inside Capacitor.
      }

      try {
        const { App } = await import("@capacitor/app");
        await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
            return;
          }
          void App.exitApp();
        });
        await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            globalChatWhipManager.refresh();
            unlockWhipSound();
          }
        });
      } catch {
        // Ignore when not running inside Capacitor.
      }
    })();

    return () => {
      document.documentElement.classList.remove("sayittome-native-shell");
      document.body.classList.remove("sayittome-native-shell");
    };
  }, []);

  return null;
}
