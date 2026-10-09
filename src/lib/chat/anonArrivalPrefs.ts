"use client";
const PREFIX="sayittome:anon-arrival-push-v1:";
export function getAnonArrivalPushPreference(uid:string) {
  if (typeof window === "undefined" || !uid) return false;
  try { return window.localStorage.getItem(PREFIX+uid) === "1"; } catch {return false;}
}
export function setAnonArrivalPushPreference(uid:string,enabled:boolean) {
  if (typeof window === "undefined" || !uid) return;
  try {window.localStorage.setItem(PREFIX+uid,enabled?"1":"0");
    window.dispatchEvent(new Event("sayittome:anon-arrival-prefs"));} catch {}
}