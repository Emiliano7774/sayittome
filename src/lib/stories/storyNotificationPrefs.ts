"use client";

import { doc, onSnapshot, setDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import {
  STORY_NOTIF_GLOBAL_DOC,
  defaultStoryNotifPrefs,
  normalizeStoryNotifPrefs,
  type StoryNotifChannel,
  type StoryNotifPrefs,
} from "@/lib/stories/storyNotificationPolicy";

const CHANGE_EVENT = "sayittome:story-notification-prefs";

let globalPrefs = defaultStoryNotifPrefs();
let packEnabled = false;
let version = 0;
const pairPrefs = new Map<string, StoryNotifPrefs>();
const listeners = new Set<() => void>();

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export function getStoryNotifPrefsVersion() {
  return version;
}

export function subscribeStoryNotifPrefs(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGlobalStoryNotifPrefs() {
  return globalPrefs;
}

export function getPairStoryNotifPrefs(peerUid: string) {
  return pairPrefs.get(String(peerUid || "").trim()) || defaultStoryNotifPrefs();
}

export function isStoryNotificationPackEnabled() {
  return packEnabled;
}

function prefsRef(uid: string, docId: string) {
  return doc(db, "usuarios", uid, "story_notif_prefs", docId);
}

export async function enableStoryNotificationPack() {
  packEnabled = true;
  globalPrefs = defaultStoryNotifPrefs();
  notify();
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(
    prefsRef(uid, STORY_NOTIF_GLOBAL_DOC),
    { ...globalPrefs, packEnabled: true, updatedAt: Date.now() },
    { merge: true },
  );
}

export async function setGlobalStoryNotifChannel(
  channel: StoryNotifChannel,
  enabled: boolean,
) {
  globalPrefs = { ...globalPrefs, [channel]: enabled };
  notify();
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(
    prefsRef(uid, STORY_NOTIF_GLOBAL_DOC),
    { ...globalPrefs, packEnabled, updatedAt: Date.now() },
    { merge: true },
  );
}

export async function setPairStoryNotifChannel(
  peerUid: string,
  channel: StoryNotifChannel,
  enabled: boolean,
) {
  const peer = String(peerUid || "").trim();
  if (!peer) return;
  const next = { ...getPairStoryNotifPrefs(peer), [channel]: enabled };
  pairPrefs.set(peer, next);
  notify();
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(
    prefsRef(uid, peer),
    { ...next, updatedAt: Date.now() },
    { merge: true },
  );
}

export function listenStoryNotifPrefs(uid: string, peerUid = "") {
  if (!uid) return () => undefined;
  const unsubs = [
    onSnapshot(prefsRef(uid, STORY_NOTIF_GLOBAL_DOC), (snap) => {
      const data = snap.data() || {};
      globalPrefs = normalizeStoryNotifPrefs(data);
      packEnabled = data.packEnabled === true;
      notify();
    }),
  ];
  if (peerUid) {
    unsubs.push(
      onSnapshot(prefsRef(uid, peerUid), (snap) => {
        pairPrefs.set(peerUid, normalizeStoryNotifPrefs(snap.data() || {}));
        notify();
      }),
    );
  }
  return () => unsubs.forEach((unsub) => unsub());
}
