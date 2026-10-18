"use client";
import { auth } from "@/lib/firebase";
import { isCapacitorNative } from "@/lib/app/nativeShell";
import { areChatNotificationsEnabled } from "@/lib/chat/chatNotificationPrefs";

const PREFIX = "sayittome:anon-arrival-push-v1:";

/** Anonymous sessions always receive in-app arrival banners. Only a registered
 * profile may opt out. OS-level notifications still require browser permission. */
export function resolveArrivalPushPreference(input: {
  anonymous: boolean;
  stored: string | null;
  chatEnabled: boolean;
  web?: boolean;
}) {
  if (input.anonymous) return true;
  // Registered profiles default ON independently of chat notifications.
  // An explicit user opt-out is the only reason to turn arrivals off.
  if (input.stored !== null) return input.stored === "1";
  // Only WEB registered profiles change default; keep native choice unchanged.
  return input.web === true || input.chatEnabled;
}

export function getAnonArrivalPushPreference(uid: string) {
  if (typeof window === "undefined" || !uid) return false;
  const user = auth.currentUser;
  const anonymous = Boolean(user?.uid === uid && user.isAnonymous);
  try {
    const stored = window.localStorage.getItem(PREFIX + uid);
    return resolveArrivalPushPreference({
      anonymous,
      stored,
      chatEnabled: areChatNotificationsEnabled(),
      web: !isCapacitorNative(),
    });
  } catch {
    // Restricted/private browser storage must not silence anonymous arrivals.
    // Storage denial is not an arrival opt-out. Respect OS permission
    // separately when attempting to display a system notification.
    return anonymous || !isCapacitorNative() || areChatNotificationsEnabled();
  }
}

export function setAnonArrivalPushPreference(uid: string, enabled: boolean) {
  if (typeof window === "undefined" || !uid) return;
  const user = auth.currentUser;
  if (!user || user.uid !== uid || user.isAnonymous) return;
  try {
    window.localStorage.setItem(PREFIX + uid, enabled ? "1" : "0");
    window.dispatchEvent(new Event("sayittome:anon-arrival-prefs"));
  } catch { /* optional browser persistence */ }
}
