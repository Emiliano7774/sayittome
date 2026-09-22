"use client";

import { onAuthStateChanged, type User } from "firebase/auth";

import { auth } from "@/lib/firebase";

const PING_MS = 60_000;

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let visibleSince = 0;
let pendingMs = 0;
let sessionStartPending = false;
let currentUid = "";
let sending = false;

function accrue() {
  if (!visibleSince) return;
  const now = Date.now();
  pendingMs += Math.max(0, now - visibleSince);
  visibleSince = now;
}

function takePending() {
  accrue();
  const visibleMs = pendingMs;
  const sessionStart = sessionStartPending;
  pendingMs = 0;
  sessionStartPending = false;
  return { visibleMs, sessionStart };
}

function restorePending(visibleMs: number, sessionStart: boolean) {
  pendingMs += visibleMs;
  if (sessionStart) sessionStartPending = true;
}

async function sendPing(user: User, visibleMs: number, sessionStart: boolean) {
  if (sending) {
    restorePending(visibleMs, sessionStart);
    return;
  }
  if (visibleMs <= 0 && !sessionStart) return;

  sending = true;
  try {
    const token = await user.getIdToken();
    const res = await fetch("/api/usage/ping", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ visibleMs, sessionStart }),
      keepalive: true,
      cache: "no-store",
    });
    if (!res.ok) restorePending(visibleMs, sessionStart);
  } catch {
    restorePending(visibleMs, sessionStart);
  } finally {
    sending = false;
  }
}

function flush(user: User | null) {
  if (!user || user.uid !== currentUid) return;
  const payload = takePending();
  void sendPing(user, payload.visibleMs, payload.sessionStart);
}

function stopClock() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  visibleSince = 0;
}

function arm(user: User) {
  stopClock();
  pendingMs = 0;
  sessionStartPending = true;
  currentUid = user.uid;
  if (typeof document !== "undefined" && !document.hidden) {
    visibleSince = Date.now();
  }
  timer = setInterval(() => {
    if (document.hidden) return;
    flush(auth.currentUser);
  }, PING_MS);
  flush(user);
}

function onVisibility() {
  const user = auth.currentUser;
  if (!user || user.uid !== currentUid) return;
  if (document.hidden) {
    accrue();
    visibleSince = 0;
    flush(user);
    return;
  }
  sessionStartPending = true;
  visibleSince = Date.now();
  flush(user);
}

export function startUsagePing() {
  if (started || typeof window === "undefined") return;
  started = true;

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      currentUid = "";
      stopClock();
      pendingMs = 0;
      sessionStartPending = false;
      return;
    }
    if (user.uid === currentUid && timer) return;
    arm(user);
  });

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", () => {
    accrue();
    visibleSince = 0;
    flush(auth.currentUser);
  });
}
