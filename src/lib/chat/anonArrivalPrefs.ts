"use client";
import { areChatNotificationsEnabled } from "@/lib/chat/chatNotificationPrefs";
const PREFIX="sayittome:anon-arrival-push-v1:";
export function getAnonArrivalPushPreference(uid:string) {
  if (typeof window === "undefined" || !uid) return false;
  try {
    const pref=window.localStorage.getItem(PREFIX+uid);
    // A user who accepts OS notifications receives connection alerts by default;
    // an explicit opt-out always wins over the default.
    return pref === "1" || (pref === null && areChatNotificationsEnabled());
  } catch {return false;}
}
export function setAnonArrivalPushPreference(uid:string,enabled:boolean) {
  if (typeof window === "undefined" || !uid) return;
  try {window.localStorage.setItem(PREFIX+uid,enabled?"1":"0");
    window.dispatchEvent(new Event("sayittome:anon-arrival-prefs"));} catch {}
}