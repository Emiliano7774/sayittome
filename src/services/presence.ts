"use client";

import { onAuthStateChanged } from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

let started = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastWriteAt = 0;
let currentUid: string | null = null;

const HEARTBEAT_MS = 45_000;
const MIN_WRITE_GAP_MS = 12_000;

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
  } catch (e) {
    console.error("presence error", e);
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
    if (!document.hidden) {
      writePresence(uid, true);
    }
  }, HEARTBEAT_MS);
}

function markCurrentUserOnline(force = false) {
  if (!currentUid) return;

  if (!document.hidden) {
    writePresence(currentUid, true, force);
  }
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

    if (!user) return;

    writePresence(user.uid, true, true);
    startHeartbeat(user.uid);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      markCurrentUserOffline(true);
    } else {
      markCurrentUserOnline(true);
    }
  });

  window.addEventListener("beforeunload", () => {
    markCurrentUserOffline(true);
  });

  window.addEventListener("focus", () => {
    markCurrentUserOnline(true);
  });

  window.addEventListener("blur", () => {
    markCurrentUserOffline(true);
  });
}