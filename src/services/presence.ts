"use client";

import { onAuthStateChanged } from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { auth, db, functions } from "@/lib/firebase";

let started = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastWriteAt = 0;
let currentUid: string | null = null;

const HEARTBEAT_MS = 90_000;
const MIN_WRITE_GAP_MS = 60_000;

async function writePresence(uid: string, online: boolean, force = false) {
  const now = Date.now();

  if (!force && now - lastWriteAt < MIN_WRITE_GAP_MS) return;

  lastWriteAt = now;

  try {
    await updateDoc(doc(db, "usuarios", uid), {
      online,
      lastSeenAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      presenceUpdatedAt: serverTimestamp(),
    });
    return true;
  } catch (e) {
    console.error("presence error", e);
    return false;
  }
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat(uid: string) {
  stopHeartbeat();

  heartbeatTimer = setInterval(() => {
    // Background tab timers keep presence alive whenever the OS permits.
    // Minimize/blur is NOT a logout or an offline signal.
    void writePresence(uid, true);
  }, HEARTBEAT_MS);
}

function markCurrentUserOnline(force = false) {
  if (!currentUid) return;
  void writePresence(currentUid, true, force);
}

function markCurrentUserOffline(force = false) {
  if (!currentUid) return;

  writePresence(currentUid, false, force);
}

export function startPresenceSystem() {
  if (started) return;

  started = true;

  onAuthStateChanged(auth, (user) => {
    currentUid = user?.uid ?? null;
    lastWriteAt = 0;
    stopHeartbeat();

    // Anonymous visitors have no usuarios profile. updateDoc would throw and
    // is unrelated to chat delivery.
    if (!user || user.isAnonymous) {
      currentUid = null;
      return;
    }

    // Notify once per real page/app session, not on periodic heartbeats,
    // foreground focus, tab visibility or background reactivation.
    void writePresence(user.uid, true, true).then((written) => {
      if (!written || auth.currentUser?.uid !== user.uid) return;
      const announce = httpsCallable(functions, "announceProfileArrival");
      void announce({}).catch(() => undefined); // Optional, presence is authoritative.
    });
    startHeartbeat(user.uid);
  });

  document.addEventListener("visibilitychange", () => {
    // Switching apps is not going offline. Renew before timers may suspend.
    markCurrentUserOnline(true);
  });

  window.addEventListener("beforeunload", () => {
    markCurrentUserOffline(true);
  });

  window.addEventListener("focus", () => {
    markCurrentUserOnline(true);
  });

  // No blur→offline: web and Android minimize both emit blur while the
  // user remains signed in and can still receive OS push notifications.
}