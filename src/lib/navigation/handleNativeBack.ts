import {
  getNativeBackDestination,
  isNativeRootRoute,
  resolveNativeBack,
  stripNativeChatFullscreen,
} from "@/lib/navigation/nativeBack";

export type NativeBackNavigation = {
  navigateTo?: string;
  hintKey?: string;
  exitApp?: boolean;
};

let backLockUntil = 0;
let pendingExitUntil = 0;

const BACK_LOCK_MS = 120;
const EXIT_CONFIRM_MS = 2000;

export function readNativePathname() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export function resetNativeBackExitTimer() {
  pendingExitUntil = 0;
}

export function resolveNativeBackNavigation(
  pathname = readNativePathname(),
): NativeBackNavigation | null {
  const now = Date.now();
  const awaitingExitConfirm = pendingExitUntil > now;

  if (!awaitingExitConfirm && now < backLockUntil) {
    return {};
  }

  const result = resolveNativeBack(pathname);

  if (result.handled) {
    if (result.dismissChatKeyboard) {
      return {};
    }

    if (result.navigateTo) {
      backLockUntil = now + BACK_LOCK_MS;
      pendingExitUntil = 0;
      stripNativeChatFullscreen();
      return { navigateTo: result.navigateTo };
    }

    if (result.hintKey) {
      if (awaitingExitConfirm) {
        backLockUntil = now + BACK_LOCK_MS;
        pendingExitUntil = 0;
        return { exitApp: true };
      }

      pendingExitUntil = now + EXIT_CONFIRM_MS;
      backLockUntil = now + BACK_LOCK_MS;
      return { hintKey: result.hintKey };
    }

    backLockUntil = now + BACK_LOCK_MS;
    pendingExitUntil = 0;
    return {};
  }

  const destination = getNativeBackDestination(pathname);
  if (destination && destination !== pathname) {
    backLockUntil = now + BACK_LOCK_MS;
    pendingExitUntil = 0;
    stripNativeChatFullscreen();
    return { navigateTo: destination };
  }

  if (isNativeRootRoute(pathname)) {
    if (awaitingExitConfirm) {
      backLockUntil = now + BACK_LOCK_MS;
      pendingExitUntil = 0;
      return { exitApp: true };
    }

    pendingExitUntil = now + EXIT_CONFIRM_MS;
    backLockUntil = now + BACK_LOCK_MS;
    return { hintKey: "native_back_exit_hint" };
  }

  return {};
}
