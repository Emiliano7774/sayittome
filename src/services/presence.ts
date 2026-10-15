"use client";

import { onAuthStateChanged } from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { auth, db, functions } from "@/lib/firebase";
import { isNativeAppShell } from "@/lib/app/nativeShell";

let started = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastWriteAt = 0;
let currentUid: string | null = null;
let foregroundActive = true;
let windowFocused = true;
let nativeAppActive = true;
let entrySequence = 0;
let pendingExitWrite: Promise<boolean> | null = null;

const HEARTBEAT_MS = 90_000;
const MIN_WRITE_GAP_MS = 60_000;
const RETURN_GAP_MS = 15 * 60_000;
const EXIT_KEY = "sayittome:registered-foreground-exit-v1:";

function saveLastExit(uid: string) {
  try { window.localStorage.setItem(EXIT_KEY + uid, String(Date.now())); }
  catch { /* Private mode may deny storage; the server remains authoritative. */ }
}

function justReturned(uid: string) {
  try {
    const last = Number(window.localStorage.getItem(EXIT_KEY + uid) || 0);
    return last > 0 && Date.now() >= last && Date.now() - last < RETURN_GAP_MS;
  } catch { return false; }
}

async function writePresence(uid: string, online: boolean, force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && now - lastWriteAt < MIN_WRITE_GAP_MS) return false;
  lastWriteAt = now;
  try {
    await updateDoc(doc(db, "usuarios", uid), {
      online,
      lastSeenAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      presenceUpdatedAt: serverTimestamp(),
      // Timestamp updated only while foregrounded OR when leaving.
      // The first heartbeat on reentry happens AFTER the server evaluates
      // the previous value, so reloads and multi-tab races cannot reannounce.
      lastForegroundAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error("presence error", error);
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
    // Paused in background: remaining signed in is not active foreground time.
    if (uid !== currentUid || !foregroundActive) return;
    void writePresence(uid, true);
  }, HEARTBEAT_MS);
}

async function enterForeground(uid: string) {
  const sequence = ++entrySequence;
  stopHeartbeat();
  // A fast return must not race the departure timestamp still in flight.
  const priorExit = pendingExitWrite;
  if (priorExit) await priorExit.catch(() => false);
  if (sequence !== entrySequence || currentUid !== uid || !foregroundActive) return;

  // Skip server calls for short returns on this installation. Firestore still
  // checks the authoritative gap across tabs/devices for eligible attempts.
  if (!justReturned(uid)) {
    try {
      const announce = httpsCallable(functions, "announceProfileArrival");
      await announce({});
    } catch {
      // Presence and chat delivery never depend on optional arrival pushes.
    }
  }
  if (sequence !== entrySequence || currentUid !== uid || !foregroundActive) return;
  void writePresence(uid, true, true);
  startHeartbeat(uid);
}

function leaveForeground(uid: string) {
  ++entrySequence;
  stopHeartbeat();
  saveLastExit(uid);
  // Keep "online" until the fifteen-minute heartbeat window expires;
  // do not equate backgrounding with logout or disable incoming chat pushes.
  pendingExitWrite = writePresence(uid, true, true);
}

function reconcileForeground() {
  // Native resume is authoritative: WebView focus can remain false after pause.
  const active = !document.hidden && (isNativeAppShell() ? nativeAppActive : windowFocused);
  if (active === foregroundActive) return;
  foregroundActive = active;
  const uid = currentUid;
  if (!uid) return;
  if (active) void enterForeground(uid);
  else leaveForeground(uid);
}

export function startPresenceSystem() {
  if (started) return;
  started = true;
  foregroundActive = !document.hidden;

  onAuthStateChanged(auth, (user) => {
    ++entrySequence;
    stopHeartbeat();
    currentUid = user && !user.isAnonymous ? user.uid : null;
    lastWriteAt = 0;
    // Anonymous visitors have no usuarios profile and keep their own 3h rules.
    if (currentUid && foregroundActive) void enterForeground(currentUid);
  });

  document.addEventListener("visibilitychange", reconcileForeground);
  window.addEventListener("focus", () => {
    windowFocused = true;
    reconcileForeground();
  });
  window.addEventListener("blur", () => {
    windowFocused = false;
    reconcileForeground();
  });
  window.addEventListener("pageshow", () => {
    windowFocused = true;
    reconcileForeground();
  });
  window.addEventListener("beforeunload", () => {
    const uid = currentUid;
    if (!uid) return;
    ++entrySequence;
    stopHeartbeat();
    saveLastExit(uid);
    // Existing unload behavior retained. This is not a Firebase sign-out.
    void writePresence(uid, false, true);
  });

  // Android WebView can deliver appStateChange without visibilitychange.
  // This listener is only installed inside the native shell.
  if (isNativeAppShell()) {
    void import("@capacitor/app").then(async ({ App }) => {
      await App.addListener("appStateChange", ({ isActive }) => {
        nativeAppActive = isActive;
        reconcileForeground();
      });
    }).catch(() => undefined);
  }
}
