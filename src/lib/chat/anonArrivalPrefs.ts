"use client";
import { auth } from "@/lib/firebase";
import { areChatNotificationsEnabled } from "@/lib/chat/chatNotificationPrefs";

const PREFIX = "sayittome:anon-arrival-push-v1:";

/** Anonymous sessions always receive in-app arrival banners. Only a registered
 * profile may opt out. OS-level notifications still require browser permission. */
export function resolveArrivalPushPreference(input: {
  anonymous: boolean;
  stored: string | null;
  chatEnabled: boolean;
}) {
  if (input.anonymous) return true;
  return input.stored === "1" || (input.stored === null && input.chatEnabled);
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
    });
  } catch {
    // Restricted/private browser storage must not silence anonymous arrivals.
    return anonymous || areChatNotificationsEnabled();
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
