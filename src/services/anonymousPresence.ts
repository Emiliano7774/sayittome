"use client";

import { onAuthStateChanged, type User } from "firebase/auth";

import {
  ANON_PRESENCE_HEARTBEAT_MS,
  resolveAnonPresenceDocId,
  resolveAnonPresencePublisherKind,
  resolveLegacyAnonPresenceCleanupId,
  shouldPublishAnonMatchPresence,
} from "@/lib/anonMatch/anonymousPresenceIdentity";
import { isAnonMatchDoorOpen, ANON_MATCH_DOOR_EVENT } from "@/lib/anonMatch/anonMatchDoor";
import { getStoredAnonMatchAlias } from "@/lib/anonMatch/anonMatchSession";
import { resolveAnonMatchSessionId } from "@/lib/anonMatch/fetchAnonMatch";
import { auth } from "@/lib/firebase";

let started = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let authUnsub: (() => void) | null = null;
let inFlight = false;
let lastWriteAt = 0;
/** Cached server alias for pagehide — never block unload waiting for bind. */
let cachedPresenceAlias = "";
let currentUser: User | null = null;

const MIN_WRITE_GAP_MS = 60_000;

async function authHeaders(): Promise<Record<string, string> | null> {
  const user = auth.currentUser;
  if (!user || !user.isAnonymous) return null;
  try {
    const idToken = await user.getIdToken();
    return {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    };
  } catch {
    return null;
  }
}

function readLegacyLocalId(): string {
  try {
    if (typeof window === "undefined") return "";
    // Read session key without minting a new local id if missing.
    const raw = sessionStorage.getItem("sayittome_anon_session") || "";
    return String(raw || "").trim();
  } catch {
    return "";
  }
}

async function writeAnonymousPresence(force = false) {
  if (typeof window === "undefined") return;
  if (document.hidden) return;

  const user = auth.currentUser;
  const kind = resolveAnonPresencePublisherKind({
    uid: user?.uid,
    isAnonymous: user?.isAnonymous,
  });
  if (!shouldPublishAnonMatchPresence(kind)) {
    cachedPresenceAlias = "";
    return;
  }
  // Auto-signed Firebase anonymous auth must not join the match pool until
  // the visitor explicitly enters shuffle (legal accept / Enter anonymously).
  if (!isAnonMatchDoorOpen(user)) {
    return;
  }

  const now = Date.now();
  if (!force && now - lastWriteAt < MIN_WRITE_GAP_MS) return;
  if (inFlight) return;

  inFlight = true;

  try {
    // Prefer stored alias; bind only when missing so heartbeats stay cheap.
    // New visitors must bind here so searchers can find them without Connect.
    let alias = getStoredAnonMatchAlias() || cachedPresenceAlias;
    if (!alias) {
      alias = await resolveAnonMatchSessionId().catch(() => "");
    }
    const anonId = resolveAnonPresenceDocId({ serverAnonAlias: alias });
    if (!anonId) return;

    cachedPresenceAlias = anonId;
    const headers = await authHeaders();
    if (!headers) return;

    const legacyLocalAnonId = resolveLegacyAnonPresenceCleanupId({
      serverAnonAlias: anonId,
      // Never mint a new local chat session id just for presence cleanup.
      localAnonSessionId: readLegacyLocalId(),
    });

    const res = await fetch("/api/anonymous-presence", {
      method: "POST",
      headers,
      body: JSON.stringify({
        anonId,
        ...(legacyLocalAnonId ? { legacyLocalAnonId } : {}),
      }),
      cache: "no-store",
      keepalive: true,
    });
    if (res.ok) {
      lastWriteAt = Date.now();
    }
  } catch {
    // Presence is best-effort — match delivery still depends on alias identity.
  } finally {
    inFlight = false;
  }
}

async function removeAnonymousPresence() {
  if (typeof window === "undefined") return;

  const anonId = cachedPresenceAlias || getStoredAnonMatchAlias();
  if (!anonId) return;

  try {
    const headers = await authHeaders();
    if (!headers) return;

    const legacyLocalAnonId = resolveLegacyAnonPresenceCleanupId({
      serverAnonAlias: anonId,
      localAnonSessionId: readLegacyLocalId(),
    });

    await fetch("/api/anonymous-presence", {
      method: "DELETE",
      headers,
      body: JSON.stringify({
        anonId,
        ...(legacyLocalAnonId ? { legacyLocalAnonId } : {}),
      }),
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    // Ignore when the tab is already closing.
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
    void writeAnonymousPresence(false);
  }, ANON_PRESENCE_HEARTBEAT_MS);
}

function onUserChanged(user: User | null) {
  // A different uid owns a different alias; reusing the cached one makes the
  // server reject presence writes as foreign.
  if ((user?.uid || "") !== (currentUser?.uid || "")) {
    cachedPresenceAlias = "";
  }
  currentUser = user;
  lastWriteAt = 0;
  stopHeartbeat();

  const kind = resolveAnonPresencePublisherKind({
    uid: user?.uid,
    isAnonymous: user?.isAnonymous,
  });

  if (!shouldPublishAnonMatchPresence(kind) || !isAnonMatchDoorOpen(user)) {
    // Registered profile, pre-enter ghost anon, or door closed: never publish.
    if (cachedPresenceAlias) {
      void removeAnonymousPresence().finally(() => {
        cachedPresenceAlias = "";
      });
    } else {
      cachedPresenceAlias = "";
    }
    return;
  }

  void writeAnonymousPresence(true);
  startHeartbeat();
}

export function startAnonymousPresenceSystem() {
  if (started || typeof window === "undefined") return;

  started = true;

  authUnsub = onAuthStateChanged(auth, (user) => {
    onUserChanged(user);
  });

  window.addEventListener(ANON_MATCH_DOOR_EVENT, () => {
    onUserChanged(auth.currentUser);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    void writeAnonymousPresence(true);
  });

  window.addEventListener("focus", () => {
    void writeAnonymousPresence(true);
  });

  window.addEventListener("pageshow", () => {
    void writeAnonymousPresence(true);
  });

  window.addEventListener("pagehide", () => {
    // Use cached alias only — do not await bind on unload.
    void removeAnonymousPresence();
  });
}

/** Force a presence heartbeat before match search so peers can find this session. */
export async function bumpAnonymousPresenceForMatch(): Promise<string> {
  if (typeof window === "undefined") return "";
  if (!isAnonMatchDoorOpen(auth.currentUser)) return "";
  lastWriteAt = 0;
  await writeAnonymousPresence(true);
  return cachedPresenceAlias || getStoredAnonMatchAlias() || "";
}

/** Leave the match pool when the anonymous legal/session door closes. */
export async function removeAnonymousPresenceForMatchDoorClose() {
  await removeAnonymousPresence();
  cachedPresenceAlias = "";
  lastWriteAt = 0;
}

/** Test/harness seam — current publisher kind after auth callback. */
export function __anonPresenceDebugState() {
  return {
    started,
    cachedPresenceAlias,
    uid: currentUser?.uid || "",
    isAnonymous: Boolean(currentUser?.isAnonymous),
    hasAuthUnsub: Boolean(authUnsub),
  };
}
