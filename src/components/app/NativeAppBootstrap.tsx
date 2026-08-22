"use client";

import { App } from "@capacitor/app";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import NativeBackHint from "@/components/app/NativeBackHint";
import { isNativeAppShell, setNativeAppActive } from "@/lib/app/nativeShell";
import { initChatNotifications } from "@/lib/chat/chatNotifications";
import { initNativePushNotifications, onNativePushForegroundResume } from "@/lib/chat/fcmPush";
import { globalChatWhipManager } from "@/lib/chat/globalChatWhipManager";
import { reprimeWhipSound } from "@/lib/chat/whipSound";
import {
  notifyNativePathnameChanged,
  readNativePathname,
  resetNativeBackExitTimer,
  resolveNativeBackNavigation,
} from "@/lib/navigation/handleNativeBack";
import { stripNativeChatFullscreen } from "@/lib/navigation/nativeBack";
import { resetChatBackNavigationState } from "@/lib/navigation/chatBackNavigation";
import { recordNativeNavPath, seedNativeNavStack } from "@/lib/navigation/nativeNavStack";
import {
  isInstantShuffleReturnDestination,
  isShuffleKeepAliveActive,
  pinShuffleWindowWhileAway,
  prepareInstantShuffleReturn,
} from "@/lib/navigation/shuffleKeepAlive";
import { restoreShuffleFeedScroll } from "@/lib/navigation/shuffleFeedScroll";
import { consumeProfileReturnTo } from "@/lib/navigation/profileReturnNav";

const HARDWARE_BACK_EVENT = "sayittomeHardwareBack";

let backHandlerInstalled = false;

function runNativeBackNavigation(
  router: ReturnType<typeof useRouter>,
  pathnameRef: React.MutableRefObject<string>,
) {
  const currentPath = readNativePathname();
  pathnameRef.current = currentPath;

  const action = resolveNativeBackNavigation(currentPath);
  if (!action) return;

  if (action.navigateTo) {
    pathnameRef.current = action.navigateTo;
    if (currentPath.startsWith("/u/") && !currentPath.endsWith("/chat")) {
      consumeProfileReturnTo();
    }
    if (isInstantShuffleReturnDestination(action.navigateTo)) {
      prepareInstantShuffleReturn();
      restoreShuffleFeedScroll();
      router.replace(action.navigateTo);
      return;
    }
    if (
      isShuffleKeepAliveActive() &&
      (action.navigateTo.startsWith("/u/") || action.navigateTo === "/shuffle")
    ) {
      pinShuffleWindowWhileAway();
    }
    router.replace(action.navigateTo);
    return;
  }

  if (action.exitApp) {
    void App.exitApp();
    return;
  }

  if (action.hintKey) {
    window.dispatchEvent(
      new CustomEvent("sayittome:native-back-hint", {
        detail: { key: action.hintKey },
      }),
    );
  }
}

function installNativeBackHandler(
  router: ReturnType<typeof useRouter>,
  pathnameRef: React.MutableRefObject<string>,
) {
  if (backHandlerInstalled || typeof window === "undefined") return;
  backHandlerInstalled = true;

  const onHardwareBack = () => {
    runNativeBackNavigation(router, pathnameRef);
  };

  window.addEventListener(HARDWARE_BACK_EVENT, onHardwareBack);

  void (async () => {
    try {
      await App.toggleBackButtonHandler({ enabled: false });
    } catch {
      // Plugin option may be unavailable on older shells.
    }

    try {
      await App.addListener("backButton", () => {
        onHardwareBack();
      });
    } catch {
      // Hardware event from MainActivity remains as fallback.
    }
  })();
}

export default function NativeAppBootstrap() {
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
    notifyNativePathnameChanged(pathname);
    resetNativeBackExitTimer();
    resetChatBackNavigationState();
    seedNativeNavStack(pathname);
    recordNativeNavPath(pathname);

    if (!pathname.startsWith("/chat/")) {
      stripNativeChatFullscreen();
    }
  }, [pathname]);

  useEffect(() => {
    if (!isNativeAppShell()) return;

    document.documentElement.classList.add("sayittome-native-shell");
    document.body.classList.add("sayittome-native-shell");

    installNativeBackHandler(router, pathnameRef);

    void (async () => {
      await initChatNotifications();
      await initNativePushNotifications();

      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        // Ignore when not running inside Capacitor.
      }

      try {
        await App.addListener("appStateChange", ({ isActive }) => {
          setNativeAppActive(isActive);
          if (isActive) {
            void onNativePushForegroundResume();
            globalChatWhipManager.refresh();
            // WebView often suspends HTMLAudio after background; force re-prime.
            reprimeWhipSound();
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
  }, [router]);

  if (!isNativeAppShell()) return null;

  return <NativeBackHint />;
}
