"use client";

import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged, type User } from "firebase/auth";

import { isCapacitorNative } from "@/lib/app/nativeShell";
import { isLocalOutgoingMessageId, tryAlertIncomingMessage } from "@/lib/chat/whipAlertDedupe";
import { playIncomingWhipSound } from "@/lib/chat/whipSound";
import { publishAnonDirectPushHint } from "@/lib/chat/realtimeIncomingHints";
import { shouldShowWebForegroundChatPush } from "@/lib/chat/webForegroundPushPolicy";
import { getAnonArrivalPushPreference } from "@/lib/chat/anonArrivalPrefs";
import { areChatNotificationsEnabled } from "@/lib/chat/chatNotificationPrefs";
import { recordNotificationStage } from "@/lib/chat/notificationIncident";
import {
  clearPendingUnregister,
  getFcmRegistrationState,
  hashFcmToken,
  readPendingUnregister,
  setFcmRegistrationState,
  writePendingUnregister,
} from "@/lib/chat/fcmRegistrationStore";
import {
  generateInstallationSecret,
  isValidFcmInstallationId,
  isValidInstallationProof,
  isValidInstallationSecret,
  makeInstallationProof,
  shouldClearPendingUnregister,
} from "@/lib/chat/fcmInstallation";
import {
  flushPendingUnlocked,
  reconcileThenRegisterUnlocked,
  withInstallationLock,
  type FcmPipelineDeps,
  type FcmUpsertResult,
} from "@/lib/chat/fcmEnablePipeline";
import { shouldAutoReconcileWebPush } from "@/lib/chat/webPushAutoPolicy";
import {
  resetWebPushSubscription,
  webPushLocalCredentialStale,
} from "@/lib/chat/webPushTokenRecovery";
import {
  automaticPushSyncSkip,
  clearPushSyncRecord,
  readPushSyncRecord,
  writePushSyncFailure,
  writePushSyncSuccess,
} from "@/lib/chat/pushSyncThrottle";
import app, { auth, functions } from "@/lib/firebase";
import {
  markChatOpenedFromNotification,
  resolvePushChatOpenPlan,
  buildChatNotificationOpenHref,
} from "@/lib/chat/chatNotificationOpen";
import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";
import { sanitizeStoryNotificationHref } from "@/lib/stories/storyNotificationPolicy";
import {
  ensureStoryNotificationChannel,
  presentStoryForegroundNotification,
} from "@/lib/stories/storyLocalNotification";

const FCM_CHANNEL_ID = "chat-messages-v2";
const INSTALLATION_KEY = "sayittome:fcm-installation-id";
const INSTALLATION_SECRET_KEY = "sayittome:fcm-installation-secret";
const PERSISTED_TOKEN_KEY = "sayittome:fcm-device-token";
const PERSISTED_UID_KEY = "sayittome:fcm-device-uid";
const FIREBASE_WEB_PUSH_VAPID_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_WEB_PUSH_VAPID_KEY ||
  "BGT2P9fWO90OjLssppgUi7-Pi6e-8wz-tf7JCxSySFJFYgwMZ9mBy8pN4vt3vwweb_0WiSWWwA_6514CYzY3pOs";

let bootstrapped = false;
let registeredToken: string | null = null;
let registeredUid: string | null = null;
let pendingChatId: string | null = null;
let pendingStoryHref: string | null = null;
let authUnsub: (() => void) | null = null;
let tokenWaiters: Array<(token: string) => void> = [];
const enableInFlightByUid = new Map<string, Promise<PushEnableResult>>();
let initInFlight: Promise<void> | null = null;
let authCallbackChain: Promise<void> = Promise.resolve();
let webForegroundMessagingUnsubscribe: (() => void) | null = null;
// Once per new page/authenticated session, confirm that the browser token still
// exists on the server. A cached in-memory token is NOT proof of a current
// usuarios/{uid}/fcmTokens entry (it can have been revoked or rotated).
// Successful checks are throttled for six hours per user to limit write costs.
const webPushServerConfirmedAt = new Map<string, number>();
const WEB_PUSH_RECONCILE_MS = 6 * 60 * 60_000;
const WEB_PUSH_SYNC_KEY = "sayittome:fcm-web-sync:v1";
const ARRIVAL_TOPIC_SYNC_KEY = "sayittome:arrival-topic-sync:v1";
/** Topic membership belongs to the token; one confirmed sync covers this long. */
const ARRIVAL_TOPIC_CONFIRM_MS = 12 * 60 * 60_000;
const arrivalTopicInFlight = new Map<string, Promise<{ data: unknown }>>();

function pushSyncStore() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** setAnonArrivalPush with one in-flight call per uid/token/state. Outcomes
 * feed the persisted throttle that background syncs consult. */
function arrivalTopicCall(uid: string) {
  const call = httpsCallable(functions, "setAnonArrivalPush");
  return (data: { token: string; enabled: boolean }) => {
    const tokenHash = hashFcmToken(data.token);
    const key = `${uid}:${tokenHash}:${data.enabled ? "on" : "off"}`;
    const existing = arrivalTopicInFlight.get(key);
    if (existing) return existing;
    const store = pushSyncStore();
    const next = call(data).then((response) => {
      const ok = (response.data as { ok?: boolean })?.ok === true;
      if (!data.enabled) clearPushSyncRecord(store, ARRIVAL_TOPIC_SYNC_KEY);
      else if (ok) writePushSyncSuccess(store, ARRIVAL_TOPIC_SYNC_KEY, { uid, tokenHash, now: Date.now() });
      else writePushSyncFailure(store, ARRIVAL_TOPIC_SYNC_KEY, { uid, tokenHash, now: Date.now() });
      return response;
    }, (error: unknown) => {
      if (data.enabled) {
        writePushSyncFailure(store, ARRIVAL_TOPIC_SYNC_KEY, { uid, tokenHash, now: Date.now() });
      }
      throw error;
    }).finally(() => {
      arrivalTopicInFlight.delete(key);
    });
    arrivalTopicInFlight.set(key, next);
    return next;
  };
}

function hasLocalWebPushCredential(uid: string) {
  const cleanUid = asId(uid);
  if (!cleanUid) return false;
  if (registeredUid === cleanUid && registeredToken) return true;
  const persisted = readPersistedDeviceToken();
  return persisted.uid === cleanUid && Boolean(persisted.token);
}

/** Restore in-memory registration after reload so UI and topic sync see the token. */
export function hydrateWebPushFromPersisted(uid: string) {
  const cleanUid = asId(uid);
  if (!cleanUid) return false;
  const persisted = readPersistedDeviceToken();
  if (persisted.uid !== cleanUid || !persisted.token) return false;
  registeredToken = persisted.token;
  registeredUid = cleanUid;
  const hash = hashFcmToken(persisted.token);
  const state = getFcmRegistrationState(cleanUid);
  if (state.status !== "active" || state.tokenHash !== hash) {
    setFcmRegistrationState(cleanUid, { status: "active", tokenHash: hash, error: "" });
  }
  return true;
}

export function getWebPushLocalSnapshot(uid: string) {
  const cleanUid = asId(uid);
  const persisted = readPersistedDeviceToken();
  const token =
    registeredUid === cleanUid && registeredToken
      ? registeredToken
      : persisted.uid === cleanUid
        ? persisted.token
        : "";
  return {
    memoryActive: Boolean(registeredUid === cleanUid && registeredToken),
    persistedUid: persisted.uid,
    persistedToken: token,
    hasCredential: hasLocalWebPushCredential(cleanUid),
  };
}

function automaticRegistrationBackingOff(uid: string) {
  // Missing a local token invalidates a previous *success*, not a backoff
  // after failure. Otherwise each focus can create another 429 burst.
  return automaticPushSyncSkip(readPushSyncRecord(pushSyncStore(), WEB_PUSH_SYNC_KEY), {
    uid,
    now: Date.now(),
    freshMs: 0,
  }) === "backoff";
}

function recordWebPushSync(uid: string, result: PushEnableResult) {
  const store = pushSyncStore();
  if (result.ok) {
    writePushSyncSuccess(store, WEB_PUSH_SYNC_KEY, {
      uid,
      tokenHash: hashFcmToken(result.token),
      now: Date.now(),
    });
  } else if (result.reason === "register" || result.reason === "callable" || result.reason === "token") {
    writePushSyncFailure(store, WEB_PUSH_SYNC_KEY, { uid, tokenHash: "", now: Date.now() });
  }
}

function clearPushSyncRecords() {
  const store = pushSyncStore();
  clearPushSyncRecord(store, WEB_PUSH_SYNC_KEY);
  clearPushSyncRecord(store, ARRIVAL_TOPIC_SYNC_KEY);
}

/** Receive data-only FCM while a web page is foregrounded. The nested chat
 * service worker handles background push; it cannot replace this page listener.
 * Shared message-id dedupe keeps Firestore listeners from showing twice. */
export async function attachWebForegroundMessagingListener() {
  if (webForegroundMessagingUnsubscribe || isCapacitorNative()) return;
  const { getMessaging, onMessage } = await import("firebase/messaging");
  webForegroundMessagingUnsubscribe = onMessage(getMessaging(app), (payload) => {
    const data = payload.data || {};
    const viewerUid = asId(auth.currentUser?.uid);
    if (viewerUid && asId(data.originUid) === viewerUid) return;
    // All public entrances (anonymous and registered) must be eligible for
    // desktop OS delivery, even with a visible tab. Firestore owns the separate
    // in-page toast; the worker deduplicates matching OS notification tags.
    if (data.type === "profile_arrival" || data.type === "anon_arrival") {
      if (!getAnonArrivalPushPreference(viewerUid)) return;
      const href = arrivalActionHref(data);
      if (!href) return;
      // Scoped geographic arrivals never enter the public Firestore stream.
      // The addressed foreground browser can still show the in-app banner.
      if (data.type === "profile_arrival" && data.geoTargeted === "1") {
        window.dispatchEvent(new CustomEvent("sayittome:geo-profile-arrival", {detail:data}));
      }
      void Promise.all([
        import("@/lib/chat/chatNotifications"),
        import("@/lib/chat/webNotificationDelivery"),
      ]).then(async ([{ ensureChatNotifyServiceWorker }, { deliverWebChatNotification }]) => {
        if (auth.currentUser?.uid !== viewerUid || !getAnonArrivalPushPreference(viewerUid)) return;
        const registration = await ensureChatNotifyServiceWorker();
        if (!registration?.active) return;
        await deliverWebChatNotification(registration,
          asId(data.title) || "Nueva conexión en SayItToMe", {
            body: asId(data.body) || "Un perfil acaba de entrar.",
            tag: asId(data.tag) || "stm-arrival-profile-" + asId(data.username),
            icon: "/icons/Icon-192.png", badge: "/icons/Icon-192.png",
            data: { type: asId(data.type), href, anonId: asId(data.anonId),
              username: asId(data.username), eventId: asId(data.eventId) },
          });
      }).catch(error => console.warn("[arrival] web foreground failed", String(error)));
      return;
    }
    const chatId = asId(data.chatId);
    const messageId = asId(data.messageId);
    if (!shouldShowWebForegroundChatPush({
      data,
      viewerUid,
      ownMessage: isLocalOutgoingMessageId(chatId, messageId),
      enabled: areChatNotificationsEnabled(),
    })) return;

    // Anonymous-direct FCM already contains the latest message preview.
    // Paint it provisionally in an OPEN chat while the normal Firestore stream
    // catches up. Regular chats have collapsed multi-message body text, so
    // those instead use the existing one-document listener fast path.
    if(data.inboxKind==="anon_direct"){
      publishAnonDirectPushHint({
        chatId,messageId,body:asId(data.body),
      });
    }

    tryAlertIncomingMessage({
      chatId,
      messageId,
      incoming: true,
      suppress: false,
      onAlert: () => {
        playIncomingWhipSound();
        const anonDirect = data.inboxKind === "anon_direct";
        void import("@/lib/chat/chatNotifications").then(({ showChatNotification }) =>
          showChatNotification({
            title: asId(data.title) || "Nuevo mensaje",
            body: asId(data.body) || "Nuevo mensaje",
            chatId,
            messageId,
            ...(anonDirect ? { inboxKind: "anon_direct" as const, href: "/chats" } : {}),
          }),
        ).catch(() => undefined);
      },
    });
  });
}

function notifyTokenWaiters(token: string) {
  const waiters = tokenWaiters;
  tokenWaiters = [];
  for (const waiter of waiters) waiter(token);
}

export async function setAnonArrivalPushEnabled(
  enabled: boolean,
  options: { repair?: boolean; automatic?: boolean } = {},
): Promise<boolean> {
  const current = auth.currentUser;
  if (!current) return false;
  // A topic sync started by a token registration must not re-register on
  // failure: the re-registration starts another sync and the pair loops.
  const mayRepair = options.repair !== false;
  // Background syncs (page lifecycle, token upserts) reuse a recent success and
  // back off after failures, across reloads and tabs. Explicit toggles call.
  const automatic = options.automatic === true || !mayRepair;
  // A persisted web token does not imply this tab has the FCM foreground
  // listener. Install it again after every fresh browser/page lifecycle.
  if (enabled && !isCapacitorNative() && typeof Notification !== "undefined" && Notification.permission === "granted") {
    void attachWebForegroundMessagingListener().catch(error =>
      recordNotificationStage("web_fcm_foreground", false, String(error)));
  }
  let persisted = readPersistedDeviceToken();
  let registeredNow = false;
  if (enabled && mayRepair && (persisted.uid !== current.uid || !persisted.token)) {
    if (automatic && automaticRegistrationBackingOff(current.uid)) return false;
    const result = isCapacitorNative()
      ? await enableNativeChatPush(current)
      : await enableWebChatPush(current);
    if (!result.ok) return false;
    registeredNow = true;
    persisted = readPersistedDeviceToken();
  }
  if (persisted.uid !== current.uid || !persisted.token) return !enabled;
  if (enabled && automatic) {
    const hasCred = persisted.uid === current.uid && Boolean(persisted.token);
    const skip = automaticPushSyncSkip(readPushSyncRecord(pushSyncStore(), ARRIVAL_TOPIC_SYNC_KEY), {
      uid: current.uid,
      tokenHash: hashFcmToken(persisted.token),
      now: Date.now(),
      freshMs: ARRIVAL_TOPIC_CONFIRM_MS,
    });
    if (skip === "fresh" && hasCred) return true;
    if (skip === "backoff" && hasCred) return false;
  }
  const fn = arrivalTopicCall(current.uid);
  try {
    const response = await fn({ token: persisted.token, enabled });
    return (response.data as { ok?: boolean })?.ok === true;
  } catch (error) {
    // Existing browsers can hold a stale local FCM token after a logout,
    // reset or failed registration. Retry once with the current authenticated
    // installation before showing an inaccurate "permission" error.
    if (enabled && mayRepair && !registeredNow) {
      try {
        const repaired = isCapacitorNative()
          ? await enableNativeChatPush(current)
          : await enableWebChatPush(current);
        if (repaired.ok) {
          const fresh = readPersistedDeviceToken();
          if (fresh.uid === current.uid && fresh.token) {
            const response = await fn({ token: fresh.token, enabled: true });
            if ((response.data as { ok?: boolean })?.ok === true) return true;
          }
        }
      } catch (retryError) {
        console.warn("[arrival] token repair failed", String(retryError));
      }
    }
    console.warn("[anon-arrival] push preference failed", String(error));
    return false;
  }
}

export function waitForRegisteredFcmToken(timeoutMs = 12000): Promise<string> {
  const existing = asId(registeredToken);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      tokenWaiters = tokenWaiters.filter((waiter) => waiter !== onToken);
      resolve("");
    }, timeoutMs);
    const onToken = (token: string) => {
      clearTimeout(timer);
      resolve(asId(token));
    };
    tokenWaiters.push(onToken);
  });
}

function asId(value: unknown) {
  return String(value || "").trim();
}

function randomUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    const v = ch === "x" ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readInstallationSecret() {
  const next = generateInstallationSecret();
  if (typeof window === "undefined") return next;
  try {
    const existing = window.localStorage.getItem(INSTALLATION_SECRET_KEY) || "";
    if (isValidInstallationSecret(existing)) return existing;
    window.localStorage.setItem(INSTALLATION_SECRET_KEY, next);
    return next;
  } catch {
    return next;
  }
}

function liveAuthUid() {
  return asId(auth.currentUser?.uid);
}

function clearPendingIfSameInstallation(installationId: string) {
  const pending = readPendingUnregister();
  if (!pending) return false;
  if (
    !shouldClearPendingUnregister({
      pendingInstallationId: pending.installationId,
      currentInstallationId: installationId,
    })
  ) {
    return false;
  }
  clearPendingUnregister();
  return true;
}

function clearLocalTokenIfMatches(token: string) {
  const clean = asId(token);
  if (clean && registeredToken === clean) {
    registeredToken = null;
    registeredUid = null;
  }
  const persisted = readPersistedDeviceToken();
  if (clean && persisted.token === clean) {
    clearPersistedDeviceToken();
    clearPushSyncRecords();
  }
}

function readInstallationId() {
  if (typeof window === "undefined") return `inst_${randomUuid()}`;
  try {
    const existing = window.localStorage.getItem(INSTALLATION_KEY) || "";
    if (isValidFcmInstallationId(existing)) return existing;
    const next = `inst_${randomUuid()}`;
    window.localStorage.setItem(INSTALLATION_KEY, next);
    return next;
  } catch {
    return `inst_${randomUuid()}`;
  }
}

async function readInstallationProof() {
  return makeInstallationProof(readInstallationId(), readInstallationSecret());
}

function persistDeviceToken(uid: string, token: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PERSISTED_UID_KEY, uid);
    window.localStorage.setItem(PERSISTED_TOKEN_KEY, token);
  } catch {
    // ignore quota
  }
}

function readPersistedDeviceToken() {
  if (typeof window === "undefined") {
    return { uid: "", token: "" };
  }
  try {
    return {
      uid: asId(window.localStorage.getItem(PERSISTED_UID_KEY)),
      token: asId(window.localStorage.getItem(PERSISTED_TOKEN_KEY)),
    };
  } catch {
    return { uid: "", token: "" };
  }
}

function clearPersistedDeviceToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PERSISTED_UID_KEY);
    window.localStorage.removeItem(PERSISTED_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function hasActiveFcmRegistration() {
  return Boolean(registeredToken && registeredUid);
}

export function consumePendingPushChatId() {
  const id = pendingChatId;
  pendingChatId = null;
  return id;
}

export function peekPendingPushChatId() {
  return pendingChatId;
}

export function resolvePushChatOpen(input: {
  chatId: string;
  authed: boolean;
  messageId?: string;
  username?: string;
}): { kind: "ignore" } | { kind: "queue"; chatId: string } | { kind: "open"; href: string } {
  return resolvePushChatOpenPlan(input);
}

export function queuePushChatIdForOpen(chatId: string) {
  queuePushChatId(chatId);
}

export function drainQueuedPushChatIdForOpen() {
  return drainQueuedPushChatId();
}

function queuePushChatId(chatId: string) {
  const id = asId(chatId);
  if (!id) return;
  pendingChatId = id;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem("sayittome:pending-push-chat", id);
  } catch {
    // ignore
  }
  window.dispatchEvent(
    new CustomEvent("sayittome:push-chat-pending", { detail: { chatId: id } }),
  );
}

function drainQueuedPushChatId() {
  const memory = consumePendingPushChatId();
  if (memory) return memory;
  if (typeof window === "undefined") return "";
  try {
    const stored = asId(window.sessionStorage.getItem("sayittome:pending-push-chat"));
    if (stored) window.sessionStorage.removeItem("sayittome:pending-push-chat");
    return stored;
  } catch {
    return "";
  }
}

async function invalidateLocalNativeRegistration() {
  registeredToken = null;
  registeredUid = null;
  if (!isCapacitorNative() || typeof window === "undefined") return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.unregister();
  } catch {
    // local disable is best-effort; pending unregister stays durable
  }
}

async function invalidateLocalWebRegistration() {
  if (isCapacitorNative() || typeof window === "undefined") return;
  try {
    const { deleteToken, getMessaging, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return;
    await deleteToken(getMessaging(app));
  } catch {
    // Backend unregister is authoritative; clearing the local SDK cache is best-effort.
  }
}

function pipelineDeps(proof: string): FcmPipelineDeps {
  return {
    liveUid: liveAuthUid,
    readPending: () => readPendingUnregister(),
    clearPending: clearPendingUnregister,
    flushCall: async (input) => {
      const unregister = httpsCallable(functions, "unregisterFcmToken");
      await unregister({
        token: input.token,
        installationId: input.installationId,
        proof: input.proof || proof,
      });
    },
    registerCall: async (input) => {
      const register = httpsCallable(functions, "registerFcmToken");
      await register({
        token: input.token,
        installationId: input.installationId,
        proof,
        tokenHash: hashFcmToken(input.token),
        platform: isCapacitorNative() ? "android" : "web",
      });
    },
  };
}

export async function reconcilePendingForEnable(uid: string, nextToken = "") {
  const pending = readPendingUnregister();
  if (!pending?.token) return false;
  const installationId = readInstallationId();
  const proof = isValidInstallationProof(pending.proof || "")
    ? String(pending.proof)
    : await readInstallationProof();
  return withInstallationLock(installationId, async () => {
    void nextToken;
    try {
      return await flushPendingUnlocked(pipelineDeps(proof), {
        currentUid: uid,
        installationId,
        currentToken: registeredToken || "",
        proof,
      });
    } catch {
      return false;
    }
  });
}

export async function upsertFcmTokenForUser(
  uid: string,
  token: string,
): Promise<FcmUpsertResult> {
  const cleanUid = asId(uid);
  const cleanToken = asId(token);
  if (!cleanUid || !cleanToken) return { ok: false, reason: "cancelled" };
  const installationId = readInstallationId();

  return withInstallationLock(installationId, async () => {
    if (liveAuthUid() !== cleanUid) return { ok: false, reason: "stale" };
    setFcmRegistrationState(cleanUid, { status: "registering", error: "" });
    const proof = await readInstallationProof();
    if (!isValidInstallationProof(proof)) {
      return { ok: false, reason: "invalid_proof" };
    }
    const result = await reconcileThenRegisterUnlocked(pipelineDeps(proof), {
      uid: cleanUid,
      token: cleanToken,
      installationId,
      proof,
      currentToken: registeredToken || "",
    });
    if (!result.ok) {
      if (result.reason === "stale" || result.reason === "cancelled") {
        return result;
      }
      setFcmRegistrationState(cleanUid, {
        status: "error",
        error: result.reason === "token_unregistered" ? "token_unregistered" : "callable_failed",
      });
      return result;
    }
    if (liveAuthUid() !== cleanUid) return { ok: false, reason: "stale" };
    registeredToken = cleanToken;
    registeredUid = cleanUid;
    persistDeviceToken(cleanUid, cleanToken);
    if (getAnonArrivalPushPreference(cleanUid)) {
      // Rejoin the opt-in topic when Firebase rotates an installation token.
      void setAnonArrivalPushEnabled(true, { repair: false });
    }
    setFcmRegistrationState(cleanUid, {
      status: "active",
      tokenHash: hashFcmToken(cleanToken),
      error: "",
    });
    return { ok: true };
  });
}

export async function flushPendingFcmUnregister() {
  const pending = readPendingUnregister();
  if (!pending?.token) return false;
  const currentUid = liveAuthUid();
  const installationId = readInstallationId();
  const proof = isValidInstallationProof(pending.proof || "")
    ? String(pending.proof)
    : await readInstallationProof();
  if (!isValidInstallationProof(proof) || !isValidFcmInstallationId(pending.installationId || installationId)) {
    return false;
  }
  return withInstallationLock(pending.installationId || installationId, async () => {
    try {
      const flushed = await flushPendingUnlocked(pipelineDeps(proof), {
        currentUid,
        installationId: pending.installationId || installationId,
        currentToken: registeredToken || "",
        proof,
      });
      if (flushed) {
        clearPendingUnregister();
        clearLocalTokenIfMatches(pending.token);
        setFcmRegistrationState(pending.uid, { status: "unknown", tokenHash: "", error: "" });
      }
      return flushed;
    } catch {
      return false;
    }
  });
}

export async function deleteCurrentDeviceFcmToken(
  uid = registeredUid || auth.currentUser?.uid || "",
) {
  const persisted = readPersistedDeviceToken();
  const cleanUid = asId(uid || persisted.uid);
  const token = asId(registeredToken || persisted.token);
  const installationId = readInstallationId();
  // An opt-out must not leave a "confirmed" record that would let a later
  // background reconcile skip re-registering this browser.
  clearPushSyncRecords();
  if (!cleanUid || !token) {
    registeredToken = null;
    registeredUid = null;
    return;
  }

  await withInstallationLock(installationId, async () => {
    const proof = await readInstallationProof();
    writePendingUnregister({
      uid: cleanUid,
      token,
      tokenHash: hashFcmToken(token),
      installationId,
      proof,
      createdAtMs: Date.now(),
    });

    await Promise.all([
      invalidateLocalNativeRegistration(),
      invalidateLocalWebRegistration(),
    ]);

    try {
      if (liveAuthUid() && liveAuthUid() !== cleanUid) return;
      const unregister = httpsCallable(functions, "unregisterFcmToken");
      await unregister({
        token,
        installationId,
        proof,
      });
      if (liveAuthUid() && liveAuthUid() !== cleanUid) return;
      if (clearPendingIfSameInstallation(installationId)) {
        clearLocalTokenIfMatches(token);
        setFcmRegistrationState(cleanUid, { status: "unknown", tokenHash: "", error: "" });
      }
    } catch {
      setFcmRegistrationState(cleanUid, { status: "error", error: "unregister_failed" });
    }
  });
}

async function ensurePushChannel() {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.createChannel({
      id: FCM_CHANNEL_ID,
      name: "Mensajes",
      description: "Avisos de mensajes nuevos",
      importance: 5,
      vibration: true,
      sound: "whip",
      visibility: 1,
    });
    await ensureStoryNotificationChannel();
  } catch {
    // Channel creation is best-effort; FCM may fall back to default.
  }
}

function queuePushStoryHref(href: string) {
  const clean = sanitizeStoryNotificationHref(href);
  if (!clean) return;
  pendingStoryHref = clean;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem("sayittome:pending-push-story", clean);
  } catch {
    // ignore
  }
}

function drainQueuedPushStoryHref() {
  const memory = pendingStoryHref;
  pendingStoryHref = null;
  if (memory) return memory;
  if (typeof window === "undefined") return "";
  try {
    const stored = sanitizeStoryNotificationHref(
      window.sessionStorage.getItem("sayittome:pending-push-story") || "",
    );
    if (stored) window.sessionStorage.removeItem("sayittome:pending-push-story");
    return stored;
  } catch {
    return "";
  }
}

function openStoryNotificationHref(href: string) {
  const clean = sanitizeStoryNotificationHref(href);
  if (!clean || typeof window === "undefined") return;
  if (!auth.currentUser) {
    queuePushStoryHref(clean);
    return;
  }
  window.location.assign(clean);
}

function openChatDeepLink(input: {
  chatId: string;
  messageId?: string;
  body?: string;
  title?: string;
}) {
  if (typeof window === "undefined") return;
  const chatId = asId(input.chatId);
  if (!chatId) return;
  markChatOpenedFromNotification({
    chatId,
    messageId: input.messageId,
    body: input.body,
    title: input.title,
  });
  prefetchChatThread(chatId);
  const plan = resolvePushChatOpen({
    chatId,
    messageId: input.messageId,
    authed: Boolean(auth.currentUser),
  });
  if (plan.kind === "queue") {
    queuePushChatId(plan.chatId);
    return;
  }
  if (plan.kind === "open") {
    window.location.assign(plan.href);
  }
}

const ARRIVAL_LOCAL_CHANNEL = "connection-arrivals-v1";
// Prevent repeated FCM callbacks from scheduling the same OS banner twice.
const displayedNativeArrivals = new Map<string,number>();
const NATIVE_ARRIVAL_DEDUPE_MS = 2 * 60_000;
function arrivalPrincipalKey(data: Record<string, unknown>) {
  // Deduplicate transport retries, never suppress a later eligible entrance.
  const eventId = asId(data.eventId);
  if (eventId) return "event:" + eventId;
  const type = asId(data.type);
  const principal = type === "anon_arrival" ? asId(data.anonId) : asId(data.username).toLowerCase();
  return type + ":" + (principal || asId(data.tag)) + (asId(data.source) === "manual_admin" ? ":admin" : "");
}
function arrivalActionHref(data: Record<string, unknown>) {
  const type = asId(data.type);
  if (type === "anon_arrival") {
    const id = asId(data.anonId);
    return /^anon_[a-z0-9_]{6,80}$/i.test(id)
      ? "/arrival?anonArrival=" + encodeURIComponent(id) : "";
  }
  if (type === "profile_arrival") {
    const username = asId(data.username);
    return /^[\p{L}\p{N}_.-]{2,40}$/u.test(username)
      ? "/u/" + encodeURIComponent(username) : "";
  }
  return "";
}
function openArrivalAction(data: Record<string, unknown>) {
  const href = arrivalActionHref(data);
  if (!href || typeof window === "undefined") return false;
  window.location.assign(href);
  return true;
}
function arrivalLocalNotificationId(data: Record<string, unknown>) {
  const key = arrivalPrincipalKey(data);
  let hash = 2166136261;
  for (const ch of key) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0) % 2000000000 || 1;
}
async function showNativeForegroundArrival(data: Record<string, unknown>, fallbackTitle = "", fallbackBody = "") {
  if (asId(data.originUid) && asId(data.originUid) === asId(auth.currentUser?.uid)) return;
  if (!getAnonArrivalPushPreference(asId(auth.currentUser?.uid))) return;
  if (!arrivalActionHref(data)) return;
  // Background notification payloads are rendered by Android itself.
  // Do not also schedule a local notification during background/foreground races.
  if (document.visibilityState !== "visible") return;
  // The already-mounted AnonArrivalToast owns foreground anonymous alerts.
  // Avoid a second, identical local OS banner for the same arrival.
  if (asId(data.type) === "anon_arrival" && asId(data.source) !== "manual_admin" && document.visibilityState === "visible") return;
  const arrivalKey = arrivalPrincipalKey(data);
  const now = Date.now();
  for (const [key, expiry] of displayedNativeArrivals) {
    if (expiry <= now) displayedNativeArrivals.delete(key);
  }
  if ((displayedNativeArrivals.get(arrivalKey) || 0) > now) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") return;
    // Recheck after the permission await. Several callbacks may all have
    // passed the initial test while the OS permission query was pending.
    const permittedAt = Date.now();
    if ((displayedNativeArrivals.get(arrivalKey) || 0) > permittedAt) return;
    // This check and insertion are synchronous, before any further await.
    displayedNativeArrivals.set(arrivalKey, permittedAt + NATIVE_ARRIVAL_DEDUPE_MS);
    while (displayedNativeArrivals.size > 300) {
      const oldest = displayedNativeArrivals.keys().next().value;
      if (!oldest) break;
      displayedNativeArrivals.delete(oldest);
    }
    await LocalNotifications.createChannel({
      id: ARRIVAL_LOCAL_CHANNEL, name: "Nuevas conexiones",
      description: "Usuarios y anónimos que acaban de conectarse",
      importance: 4, vibration: true, visibility: 1, sound: "default",
    });
    await LocalNotifications.schedule({notifications:[{
      id: arrivalLocalNotificationId(data),
      title: asId(data.title) || fallbackTitle || "🌙 SayItToMe",
      body: asId(data.body) || fallbackBody || "Nueva conexión",
      channelId: ARRIVAL_LOCAL_CHANNEL,
      smallIcon: "ic_stat_notify",
      largeIcon: "ic_notify_moon", iconColor: "#7C3AED",
      extra: {type:asId(data.type), anonId:asId(data.anonId), username:asId(data.username)},
    }]});
  } catch (error) {
    console.warn("[arrival] foreground notification unavailable", String(error));
  }
}

async function attachPushListeners() {
  const { PushNotifications } = await import("@capacitor/push-notifications");

  await PushNotifications.addListener("registration", (event) => {
    const token = asId(event.value);
    if (!token) return;
    registeredToken = token;
    notifyTokenWaiters(token);
    recordNotificationStage("registration_event", true, "token_present");
  });

  await PushNotifications.addListener("registrationError", (error) => {
    console.warn("FCM registrationError", error);
    recordNotificationStage("registration_error", false, "listener");
  });

  await PushNotifications.addListener("pushNotificationReceived", (event) => {
    const data = (event.notification?.data || {}) as Record<string, unknown>;
    const type = asId(data.type);
    if (type === "anon_arrival" || type === "profile_arrival") {
      void showNativeForegroundArrival(data, asId(event.notification?.title), asId(event.notification?.body));
      return;
    }
    if (type === "story_like" || type === "story_upload") {
      void presentStoryForegroundNotification({
        title: asId(data.title) || asId(event.notification?.title),
        body: asId(data.body) || asId(event.notification?.body),
        href: asId(data.href),
        tag: asId(data.tag),
      });
      return;
    }
    // Reuse native FCM's already-delivered anonymous message preview.
    // No additional OS banner, DB listener, or Firestore read.
    if(type==="chat_message"&&data.inboxKind==="anon_direct"){
      const chatId=asId(data.chatId),messageId=asId(data.messageId);
      if(asId(data.recipientUid)===asId(auth.currentUser?.uid)&&
        !isLocalOutgoingMessageId(chatId,messageId)){
        publishAnonDirectPushHint({
          chatId,messageId,
          body:asId(data.body)||asId(event.notification?.body),
        });
      }
    }
    // Foreground chat: in-app whip owns UX. Avoid double OS sound.
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
    const data = (event.notification?.data || {}) as Record<string, unknown>;
    if (asId(data.type) === "anon_arrival" || asId(data.type) === "profile_arrival") {
      openArrivalAction(data);
      return;
    }
    const chatId = asId(data.chatId);
    if (chatId) {
      openChatDeepLink({
        chatId,
        messageId: asId(data.messageId),
        body: asId(data.body) || asId(event.notification?.body),
        title: asId(data.title) || asId(event.notification?.title),
      });
      return;
    }
    openStoryNotificationHref(asId(data.href));
  });

  // Foreground Android FCM uses a local OS banner. Its click must follow the
  // same action as a background FCM notification (including anon direct chat).
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      const extra = (event.notification?.extra || {}) as Record<string, unknown>;
      if (extra.type === "anon_arrival" || extra.type === "profile_arrival") {
        openArrivalAction(extra);
      }
    });
  } catch { /* OS notification action unavailable. */ }
}

export type PushEnableResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason:
        | "denied"
        | "no_auth"
        | "register"
        | "token"
        | "callable"
        | "prefs"
        | "not_native"
        | "not_web"
        | "stale"
        | "cancelled";
      message: string;
    };

export async function registerNativePushIfEnabled(user?: User | null) {
  const result = await enableNativeChatPush(user);
  return result.ok;
}

export async function registerWebPushIfEnabled(user?: User | null) {
  const result = await enableWebChatPush(user);
  return result.ok;
}

async function hasLiveWebPushSubscription(): Promise<boolean> {
  try {
    const { ensureChatNotifyServiceWorker } = await import("@/lib/chat/chatNotifications");
    const registration = await ensureChatNotifyServiceWorker();
    if (!registration?.pushManager) return false;
    return Boolean(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/** Shared reconciliation for *all* web identities, including anonymous visitors.
 * Chat-message and arrival alerts have independent preferences; a visitor
 * who always has arrivals ON must not need access to profile-only Settings.
 * Does not request OS permission or override explicit opt-outs. */
export async function reconcileWebChatPush(user?: User | null): Promise<PushEnableResult> {
  const uid = asId(user?.uid || auth.currentUser?.uid);
  const arrivalEnabled = uid ? getAnonArrivalPushPreference(uid) : false;
  if (!shouldAutoReconcileWebPush({
    uid,
    native: isCapacitorNative(),
    permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    messagesEnabled: areChatNotificationsEnabled(),
    arrivalsEnabled: arrivalEnabled,
  })) {
    return { ok: false, reason: "prefs", message: "not_permitted" };
  }
  const localToken = () => {
    hydrateWebPushFromPersisted(uid);
    if (registeredUid === uid && registeredToken) return asId(registeredToken);
    const persistedToken = readPersistedDeviceToken();
    return persistedToken.uid === uid ? asId(persistedToken.token) : "";
  };
  const hasPushSubscription = await hasLiveWebPushSubscription();
  if (
    webPushLocalCredentialStale(hasLocalWebPushCredential(uid), hasPushSubscription)
  ) {
    recordNotificationStage("web_fcm_sub", false, "missing_push_subscription");
  }
  if (
    hasLocalWebPushCredential(uid) &&
    hasPushSubscription &&
    Date.now() - (webPushServerConfirmedAt.get(uid) || 0) < WEB_PUSH_RECONCILE_MS
  ) {
    void attachWebForegroundMessagingListener().catch(() => undefined);
    return { ok: true, token: localToken() };
  }
  // Reloads and other tabs share this browser's last confirmation and failure
  // backoff; explicit enable/repair actions call enableWebChatPush directly.
  const store = pushSyncStore();
  const persisted = automaticPushSyncSkip(readPushSyncRecord(store, WEB_PUSH_SYNC_KEY), {
    uid,
    tokenHash: hasLocalWebPushCredential(uid)
      ? hashFcmToken(localToken())
      : "",
    now: Date.now(),
    freshMs: WEB_PUSH_RECONCILE_MS,
  });
  if (persisted === "fresh" && hasLocalWebPushCredential(uid)) {
    hydrateWebPushFromPersisted(uid);
    void attachWebForegroundMessagingListener().catch(() => undefined);
    // A persisted sync success is not proof the token still delivers. FCM can
    // invalidate the push subscription while localStorage still looks "fresh"
    // for six hours — that left prod browsers with zero message banners.
    if (webPushServerConfirmedAt.get(uid) && hasPushSubscription) {
      return { ok: true, token: localToken() };
    }
  }
  if (persisted === "fresh" && !hasLocalWebPushCredential(uid)) {
    clearPushSyncRecord(store, WEB_PUSH_SYNC_KEY);
  }
  if (persisted === "backoff") {
    // Retry after the existing cooldown even if there is no token locally;
    // only a stale 'fresh' result may be bypassed for first-time enrollment.
    return { ok: false, reason: "register", message: "retry_backoff" };
  }
  const result = await enableWebChatPush(user);
  if (result.ok) webPushServerConfirmedAt.set(uid, Date.now());
  return result;
}

export async function enableWebChatPush(user?: User | null): Promise<PushEnableResult> {
  if (isCapacitorNative() || typeof window === "undefined") {
    return { ok: false, reason: "not_web", message: "not_web" };
  }
  if (!areChatNotificationsEnabled() && !getAnonArrivalPushPreference(asId(user?.uid || auth.currentUser?.uid))) {
    await flushPendingFcmUnregister();
    return { ok: false, reason: "prefs", message: "prefs_off" };
  }
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return { ok: false, reason: "denied", message: "permission_denied" };
  }

  const uid = asId(user?.uid || auth.currentUser?.uid);
  if (!uid) return { ok: false, reason: "no_auth", message: "missing_uid" };
  const inFlightKey = `web:${uid}`;
  const existing = enableInFlightByUid.get(inFlightKey);
  if (existing) return existing;

  const next = (async (): Promise<PushEnableResult> => {
    try {
      const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
      if (!(await isSupported())) {
        recordNotificationStage("web_fcm_supported", false, "unsupported");
        return { ok: false, reason: "not_web", message: "unsupported" };
      }
      const { ensureChatNotifyServiceWorker } = await import("@/lib/chat/chatNotifications");
      const registration = await ensureChatNotifyServiceWorker();
      if (!registration?.active) {
        recordNotificationStage("web_fcm_sw", false, "inactive");
        return { ok: false, reason: "register", message: "service_worker_inactive" };
      }

      const vapidKey = String(FIREBASE_WEB_PUSH_VAPID_KEY).trim();
      const requestToken = async () => asId(
        await getToken(getMessaging(app), {
          serviceWorkerRegistration: registration,
          ...(vapidKey ? { vapidKey } : {}),
        }),
      );
      let token = await requestToken();
      if (!token) {
        recordNotificationStage("web_fcm_token", false, "empty");
        return { ok: false, reason: "token", message: "empty_token" };
      }

      let upserted = await upsertFcmTokenForUser(uid, token);
      if (!upserted.ok && upserted.reason === "token_unregistered") {
        // FCM already invalidated the SDK's cached token. Only a new push
        // subscription makes getToken() mint a deliverable one; retry once.
        recordNotificationStage("web_fcm_token", false, "server_unregistered");
        await resetWebPushSubscription(registration);
        token = await requestToken();
        if (!token) {
          recordNotificationStage("web_fcm_token", false, "empty_after_reset");
          return { ok: false, reason: "token", message: "empty_token" };
        }
        upserted = await upsertFcmTokenForUser(uid, token);
      }
      if (!upserted.ok) {
        recordNotificationStage("web_fcm_register", false, upserted.reason);
        return {
          ok: false,
          reason:
            upserted.reason === "stale" || upserted.reason === "cancelled"
              ? upserted.reason
              : "callable",
          message: upserted.reason,
        };
      }
      // A data-only push addressed to an open web tab requires onMessage.
      // Without this listener the browser may silently consume it without an
      // OS banner, even though the same event works in the Android app.
      try {
        await attachWebForegroundMessagingListener();
        recordNotificationStage("web_fcm_foreground", true, "listening");
      } catch (error) {
        recordNotificationStage("web_fcm_foreground", false, String((error as Error)?.name || "err"));
      }
      webPushServerConfirmedAt.set(uid, Date.now());
      recordNotificationStage(
        "web_fcm_register",
        true,
        vapidKey ? "custom_vapid" : "default_vapid",
      );
      return { ok: true, token };
    } catch (error) {
      recordNotificationStage(
        "web_fcm_register",
        false,
        String((error as Error)?.message || (error as Error)?.name || "failed").slice(0, 120),
      );
      return {
        ok: false,
        reason: "register",
        message: String((error as Error)?.message || "web_fcm_register_failed"),
      };
    }
  })().then((result) => {
    recordWebPushSync(uid, result);
    return result;
  }).finally(() => {
    enableInFlightByUid.delete(inFlightKey);
  });
  enableInFlightByUid.set(inFlightKey, next);
  return next;
}

export async function enableNativeChatPush(user?: User | null): Promise<PushEnableResult> {
  if (!isCapacitorNative() || typeof window === "undefined") {
    recordNotificationStage("enable_not_native", false, "not_native");
    return { ok: false, reason: "not_native", message: "not_native" };
  }
  const uid = asId(user?.uid || auth.currentUser?.uid);
  if (!uid) {
    return { ok: false, reason: "no_auth", message: "missing_uid" };
  }
  const existing = enableInFlightByUid.get(uid);
  if (existing) return existing;
  const next = enableNativeChatPushOnce(user).finally(() => {
    enableInFlightByUid.delete(uid);
  });
  enableInFlightByUid.set(uid, next);
  return next;
}

async function enableNativeChatPushOnce(user?: User | null): Promise<PushEnableResult> {
  recordNotificationStage("enable_start", true, isCapacitorNative() ? "native" : "web");
  if (!isCapacitorNative() || typeof window === "undefined") {
    recordNotificationStage("enable_not_native", false, "not_native");
    return { ok: false, reason: "not_native", message: "not_native" };
  }

  await initNativePushNotifications({ skipAutoEnable: true });

  if (!areChatNotificationsEnabled() && !getAnonArrivalPushPreference(asId(user?.uid || auth.currentUser?.uid))) {
    await flushPendingFcmUnregister();
    recordNotificationStage("enable_prefs", false, "prefs_off");
    return { ok: false, reason: "prefs", message: "prefs_off" };
  }

  const uid = asId(user?.uid || auth.currentUser?.uid);
  recordNotificationStage("enable_auth_uid", Boolean(uid), uid ? "present" : "missing");
  if (!uid) {
    recordNotificationStage("enable_no_auth", false, "missing_uid");
    return { ok: false, reason: "no_auth", message: "missing_uid" };
  }

  await ensurePushChannel();
  const { PushNotifications } = await import("@capacitor/push-notifications");

  const current = await PushNotifications.checkPermissions();
  recordNotificationStage("enable_push_check", true, String(current.receive || "empty"));
  let granted = current.receive === "granted";
  if (!granted) {
    const requested = await PushNotifications.requestPermissions();
    granted = requested.receive === "granted";
    recordNotificationStage("enable_push_request", granted, String(requested.receive || "empty"));
  }
  if (!granted) {
    recordNotificationStage("enable_denied", false, "permission_denied");
    return { ok: false, reason: "denied", message: "permission_denied" };
  }

  try {
    await PushNotifications.register();
    recordNotificationStage("enable_push_register", true, "called");
  } catch (error) {
    recordNotificationStage("enable_push_register", false, "register_failed");
    return {
      ok: false,
      reason: "register",
      message: String((error as Error)?.message || "register_failed"),
    };
  }

  const token = await waitForRegisteredFcmToken(12000);
  recordNotificationStage("enable_registration_token", Boolean(token), token ? "present" : "timeout");
  if (!token) {
    return { ok: false, reason: "token", message: "registration_timeout" };
  }

  try {
    const upserted = await upsertFcmTokenForUser(uid, token);
    if (!upserted.ok) {
      recordNotificationStage("enable_callable_registerFcmToken", false, upserted.reason);
      return {
        ok: false,
        reason: upserted.reason === "stale" || upserted.reason === "cancelled"
          ? upserted.reason
          : "callable",
        message: upserted.reason,
      };
    }
    recordNotificationStage("enable_callable_registerFcmToken", true, "ok");
  } catch (error) {
    setFcmRegistrationState(uid, { status: "error", error: "callable_failed" });
    recordNotificationStage("enable_callable_registerFcmToken", false, "callable_failed");
    return {
      ok: false,
      reason: "callable",
      message: String((error as Error)?.message || "registerFcmToken_failed"),
    };
  }

  recordNotificationStage("enable_done", true, "token_active");
  return { ok: true, token };
}

export async function openNativeNotificationSettings() {
  if (typeof window === "undefined") return false;

  const intent =
    "intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;S.android.provider.extra.APP_PACKAGE=com.sayittome.app;end";

  try {
    const opened = window.open(intent, "_system");
    if (opened) return true;
  } catch {
    // fall through
  }

  try {
    window.location.assign(intent);
    return true;
  } catch {
    return false;
  }
}

export async function initNativePushNotifications(options?: { skipAutoEnable?: boolean }) {
  if (typeof window === "undefined" || !isCapacitorNative()) return;
  if (bootstrapped) return;
  if (initInFlight) {
    await initInFlight;
    return;
  }

  initInFlight = (async () => {
    await attachPushListeners();
    await ensurePushChannel();

    if (!authUnsub) {
      authUnsub = onAuthStateChanged(auth, (user) => {
        if (!user) {
          registeredUid = null;
          return;
        }
        authCallbackChain = authCallbackChain
          .catch(() => undefined)
          .then(async () => {
            if (areChatNotificationsEnabled() || getAnonArrivalPushPreference(user.uid)) {
              await registerNativePushIfEnabled(user);
            } else {
              await flushPendingFcmUnregister();
            }
            const pendingChat = drainQueuedPushChatId();
            if (pendingChat && user.uid) {
              markChatOpenedFromNotification({ chatId: pendingChat });
              prefetchChatThread(pendingChat);
              window.location.assign(
                buildChatNotificationOpenHref({ chatId: pendingChat }),
              );
              return;
            }
            const pendingStory = drainQueuedPushStoryHref();
            if (pendingStory) {
              window.location.assign(pendingStory);
            }
          });
      });
    }
    bootstrapped = true;
  })().finally(() => {
    initInFlight = null;
  });
  await initInFlight;

  if (options?.skipAutoEnable) return;
  if (auth.currentUser && (areChatNotificationsEnabled() || getAnonArrivalPushPreference(auth.currentUser.uid))) {
    await registerNativePushIfEnabled(auth.currentUser);
  } else {
    await flushPendingFcmUnregister();
  }
}

/** Native + FCM token active → OS notifs come from FCM; skip LocalNotifications. */
export function shouldSuppressLocalOsNotification() {
  return isCapacitorNative() && hasActiveFcmRegistration();
}

export { FCM_CHANNEL_ID };

/** Resume: retry durable pending unregister even if prefs are off; register only if prefs on. */
export async function onNativePushForegroundResume() {
  const user = auth.currentUser;
  if (!user || (!areChatNotificationsEnabled() && !getAnonArrivalPushPreference(user.uid))) {
    await flushPendingFcmUnregister();
    return;
  }
  await registerNativePushIfEnabled(user);
}
