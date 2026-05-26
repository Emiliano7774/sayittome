"use client";

import { getAnonSessionId } from "@/lib/chat/anonSession";

let started = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let lastWriteAt = 0;

const HEARTBEAT_MS = 30000;
const MIN_WRITE_GAP_MS = 12000;

async function writeAnonymousPresence(force = false) {
  if (typeof window === "undefined") return;
  if (document.hidden) return;

  const now = Date.now();
  if (!force && now - lastWriteAt < MIN_WRITE_GAP_MS) return;
  if (inFlight) return;

  inFlight = true;
  lastWriteAt = now;

  try {
    const anonId = getAnonSessionId();

    await fetch("/api/anonymous-presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonId }),
      cache: "no-store",
      keepalive: true,
    });
  } catch {
  } finally {
    inFlight = false;
  }
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    writeAnonymousPresence(false);
  }, HEARTBEAT_MS);
}

export function startAnonymousPresenceSystem() {
  if (started || typeof window === "undefined") return;

  started = true;
  writeAnonymousPresence(true);
  startHeartbeat();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    writeAnonymousPresence(true);
  });

  window.addEventListener("focus", () => {
    writeAnonymousPresence(true);
  });

  window.addEventListener("pageshow", () => {
    writeAnonymousPresence(true);
  });
}
