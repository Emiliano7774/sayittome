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
import {
  clearAnonMatchServerAlias,
  getStoredAnonMatchAlias,
  storeAnonMatchAlias,
} from "@/lib/anonMatch/anonMatchSession";
import { resolveAnonMatchSessionId } from "@/lib/anonMatch/fetchAnonMatch";
import { readVisibilityPayload } from "@/lib/shuffle/audiencePayload";
import { getAnonSessionId } from "@/lib/chat/anonSession";
import { auth } from "@/lib/firebase";
import { isNativeAppShell } from "@/lib/app/nativeShell";
import { markBrowserAway, browserAwaySince, clearBrowserAway } from "@/lib/anonMatch/browserAwayClock";

let started = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let authUnsub: (() => void) | null = null;
let inFlight = false;
let pendingForcedHeartbeat = false;
let lastWriteAt = 0;
/** Cached server alias for explicit leave (door close / logout). */
let cachedPresenceAlias = "";
let currentUser: User | null = null;
/** Last usable auth headers for the browser's best-effort unload request. */
let leaveHeaders: Record<string, string> | null = null;
let nativeAppActive = true;
let windowFocused = true;

function anonymousForegroundActive() {
  return !document.hidden && (isNativeAppShell() ? nativeAppActive : windowFocused);
}

const MIN_WRITE_GAP_MS = 60_000;
const PRESENCE_FETCH_TIMEOUT_MS = 12_000;

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

async function postPresenceHeartbeat(anonId: string, headers: Record<string, string>, backgrounded: boolean, awaySinceMs = 0) {
  const legacyLocalAnonId = resolveLegacyAnonPresenceCleanupId({
    serverAnonAlias: anonId,
    // Never mint a new local chat session id just for presence cleanup.
    localAnonSessionId: readLegacyLocalId(),
  });

  // Browser background transitions are small, authenticated keepalive POSTs.
  // Never combine keepalive and AbortSignal (rejected in some browsers).
  const res = await fetch("/api/anonymous-presence", {
    method: "POST",
    headers,
    body: JSON.stringify({
      anonId,
      chatSessionId: getAnonSessionId(),
      backgrounded,
      ...(awaySinceMs ? { awaySinceMs } : {}),
      ...readVisibilityPayload(),
      ...(legacyLocalAnonId ? { legacyLocalAnonId } : {}),
    }),
    cache: "no-store",
    ...(backgrounded ? { keepalive: true } : { signal: AbortSignal.timeout(PRESENCE_FETCH_TIMEOUT_MS) }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    anonId?: string;
    error?: string;
  };
  return { res, json };
}

function adoptServerPresenceAlias(anonId: string, ownerUid?: string) {
  const id = String(anonId || "").trim();
  if (!id) return;
  cachedPresenceAlias = id;
  storeAnonMatchAlias(id, ownerUid);
}

async function writeAnonymousPresence(force = false, backgrounded = !anonymousForegroundActive()) {
  if (typeof window === "undefined") return;

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
  if (inFlight) {
    // Hidden/visible events racing with a heartbeat still need the correct
    // lease duration (1h hidden vs 15m foreground).
    if (force) pendingForcedHeartbeat = true;
    return;
  }

  inFlight = true;

  try {
    // Prefer stored alias; bind only when missing so heartbeats stay cheap.
    // New visitors must bind here so searchers can find them without Connect.
    let alias = getStoredAnonMatchAlias() || cachedPresenceAlias;
    if (!alias) {
      alias = await resolveAnonMatchSessionId().catch(() => "");
    }
    let anonId = resolveAnonPresenceDocId({ serverAnonAlias: alias });
    if (!anonId) return;

    cachedPresenceAlias = anonId;
    // Reuse an already-issued token on blur: launch keepalive while the
    // browser still lets the page run. Foreground can refresh normally.
    const headers = backgrounded && leaveHeaders ? leaveHeaders : await authHeaders();
    if (!headers) return;
    leaveHeaders = headers;

    const awaySinceMs = backgrounded ? 0 : browserAwaySince("anon", user!.uid);
    let { res, json } = await postPresenceHeartbeat(anonId, headers, backgrounded, awaySinceMs);

    // Rotated / stale client alias must not leave an open tab offline.
    const err = String(json?.error || "");
    if (
      !res.ok &&
      (err === "alias_spoof" || err === "missing_server_alias" || err === "unbound_alias")
    ) {
      clearAnonMatchServerAlias();
      cachedPresenceAlias = "";
      const rebound = await resolveAnonMatchSessionId().catch(() => "");
      anonId = resolveAnonPresenceDocId({ serverAnonAlias: rebound });
      if (!anonId) return;
      cachedPresenceAlias = anonId;
      ({ res, json } = await postPresenceHeartbeat(anonId, headers, backgrounded, awaySinceMs));
    }

    if (res.ok) {
      if (!backgrounded) clearBrowserAway("anon", user!.uid);
      lastWriteAt = Date.now();
      adoptServerPresenceAlias(String(json?.anonId || anonId), user?.uid);
    }
  } catch {
    // Presence is best-effort — match delivery still depends on alias identity.
  } finally {
    inFlight = false;
    if (pendingForcedHeartbeat) {
      pendingForcedHeartbeat = false;
      void writeAnonymousPresence(true);
    }
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
    // While the visitor is away, leave the LAST foreground/exit heartbeat
    // intact so returning after 60 seconds can be recognized as reentry.
    if (!anonymousForegroundActive()) return;
    void writeAnonymousPresence(false);
  }, ANON_PRESENCE_HEARTBEAT_MS);
}

function onUserChanged(user: User | null) {
  // A different uid owns a different alias; reusing the cached one makes the
  // server reject presence writes as foreign.
  if ((user?.uid || "") !== (currentUser?.uid || "")) {
    cachedPresenceAlias = "";
    leaveHeaders = null;
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

  if (!anonymousForegroundActive()) {
    if (user?.uid) markBrowserAway("anon", user.uid);
  } else {
    void writeAnonymousPresence(true);
  }
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
    // Brave/Chrome on mobile can show the tab without firing window.focus.
    // The foreground heartbeat must not stay stuck as backgrounded=true.
    if (!document.hidden) windowFocused = true;
    if (anonymousForegroundActive()) void writeAnonymousPresence(true);
    else if (auth.currentUser?.isAnonymous) markBrowserAway("anon", auth.currentUser.uid);
  });

  window.addEventListener("focus", () => {
    windowFocused = true;
    void writeAnonymousPresence(true);
  });
  window.addEventListener("blur", () => {
    windowFocused = false;
    if (auth.currentUser?.isAnonymous) markBrowserAway("anon", auth.currentUser.uid);
  });

  window.addEventListener("pageshow", () => {
    windowFocused = true;
    void writeAnonymousPresence(true);
  });

  // Native app backgrounding may not fire WebView visibilitychange.
  if (isNativeAppShell()) {
    void import("@capacitor/app").then(async ({ App }) => {
      await App.addListener("appStateChange", ({isActive}) => {
        nativeAppActive = isActive;
        void writeAnonymousPresence(true);
      });
    }).catch(() => undefined);
  }

  // beforeunload covers ordinary desktop tab/window close without waiting
  // for background timers. Do NOT use pagehide/visibilitychange as a leave:
  // Android and bfcache fire those for open-but-suspended sessions.
  window.addEventListener("beforeunload", () => {
    const alias = cachedPresenceAlias || getStoredAnonMatchAlias();
    if (!alias || !leaveHeaders || !isAnonMatchDoorOpen(auth.currentUser)) return;
    try {
      // Only a cached token: async getIdToken cannot reliably finish on unload.
      void fetch("/api/anonymous-presence", {
        method: "DELETE",
        headers: leaveHeaders,
        body: JSON.stringify({ anonId: alias }),
        cache: "no-store",
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Crash / OS kill cannot be observed reliably; server expiry is fallback.
    }
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
