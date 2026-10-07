"use client";

import { App } from "@capacitor/app";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import NativeBackHint from "@/components/app/NativeBackHint";
import { isNativeAppShell, setNativeAppActive } from "@/lib/app/nativeShell";
import { initChatNotifications } from "@/lib/chat/chatNotifications";
import { waitForPendingChatSends } from "@/lib/chat/pendingChatSends";
import { initNativePushNotifications, onNativePushForegroundResume } from "@/lib/chat/fcmPush";
import { globalChatWhipManager } from "@/lib/chat/globalChatWhipManager";
import { reprimeWhipSound } from "@/lib/chat/whipSound";
import {
  noteNativeHardwareBack,
  notifyNativePathnameChanged,
  readNativePathname,
  resetNativeBackExitTimer,
  resolveNativeBackNavigation,
  shouldCoalesceNativeHardwareBack,
} from "@/lib/navigation/handleNativeBack";
import { stripNativeChatFullscreen } from "@/lib/navigation/nativeBack";
import { resetChatBackNavigationState } from "@/lib/navigation/chatBackNavigation";
import { recordNativeNavPath, seedNativeNavStack } from "@/lib/navigation/nativeNavStack";
import { prepareInstantKeepAliveReturn } from "@/lib/navigation/instantKeepAliveReturn";
import {
  isInstantShuffleReturnDestination,
  isShuffleKeepAliveActive,
  pinShuffleWindowWhileAway,
} from "@/lib/navigation/shuffleKeepAlive";
import { recoverShuffleOnForeground } from "@/lib/navigation/shuffleForegroundRecover";
import { isMainTabHref } from "@/lib/navigation/mainTabs";
import { consumeProfileReturnTo } from "@/lib/navigation/profileReturnNav";

const HARDWARE_BACK_EVENT = "sayittomeHardwareBack";

let backHandlerInstalled = false;

async function runNativeBackNavigation(
  router: ReturnType<typeof useRouter>,
  pathnameRef: React.MutableRefObject<string>,
) {
  const currentPath = readNativePathname();
  pathnameRef.current = currentPath;

  const action = resolveNativeBackNavigation(currentPath);
  if (!action) return;

  if (action.navigateTo) {
    if (currentPath.startsWith("/chat/")) {
      await waitForPendingChatSends();
      // A UI back action may have navigated while hardware back was waiting.
      // Never apply a stale second navigation after the send ACK.
      if (readNativePathname() !== currentPath) return;
    }

    pathnameRef.current = action.navigateTo;
    if (currentPath.startsWith("/u/") && !currentPath.endsWith("/chat")) {
      consumeProfileReturnTo();
    }
    // Paint the cached keep-alive surface before soft-nav so back never flashes
    // a loading shell or full document reload (chat→chats, profile→shuffle, …).
    if (
      isInstantShuffleReturnDestination(action.navigateTo) ||
      isMainTabHref(action.navigateTo)
    ) {
      prepareInstantKeepAliveReturn(action.navigateTo);
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
    const now = Date.now();
    if (shouldCoalesceNativeHardwareBack(now)) return;
    noteNativeHardwareBack(now);
    void runNativeBackNavigation(router, pathnameRef);
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

    // Reveal the already-rendered web surface immediately. Push/local-notification
    // bootstrap can touch native plugins + Firebase Functions and must never gate
    // first paint or keep the native splash visible.
    void (async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        // Ignore when not running inside Capacitor.
      }
    })();

    // App-state handling is lightweight and should be available immediately.
    void App.addListener("appStateChange", ({ isActive }) => {
      setNativeAppActive(isActive);
      if (isActive) {
        void onNativePushForegroundResume();
        globalChatWhipManager.refresh();
        // WebView often suspends HTMLAudio after background; force re-prime.
        reprimeWhipSound();
        recoverShuffleOnForeground("app-resume");
      }
    }).catch(() => {
      // Ignore when not running inside Capacitor.
    });

    // Defer notification/plugin/network bootstrap until after the first paint so
    // cold start remains visual-first. Functionality is unchanged once booted.
    const warmNativeMainTabs = () => {
      for (const href of ["/chats", "/stories", "/boost", "/settings", "/shuffle"]) {
        if (href === pathnameRef.current) continue;
        try {
          router.prefetch(href);
        } catch {
          // Best-effort static route/code warmup only.
        }
      }
    };
    const startNotificationBootstrap = () => {
      void Promise.allSettled([
        initChatNotifications(),
        initNativePushNotifications(),
      ]);
    };
    const runPostPaintWarmup = () => {
      warmNativeMainTabs();
      startNotificationBootstrap();
    };
    let idleId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let secondRafId: number | null = null;
    const startAfterPaint = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(runPostPaintWarmup, {
          timeout: 1200,
        });
      } else {
        timerId = globalThis.setTimeout(runPostPaintWarmup, 180);
      }
    };
    const rafId = window.requestAnimationFrame(() => {
      secondRafId = window.requestAnimationFrame(startAfterPaint);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      if (secondRafId !== null) window.cancelAnimationFrame(secondRafId);
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== null) globalThis.clearTimeout(timerId);
      document.documentElement.classList.remove("sayittome-native-shell");
      document.body.classList.remove("sayittome-native-shell");
    };
  }, [router]);

  if (!isNativeAppShell()) return null;

  return <NativeBackHint />;
}
