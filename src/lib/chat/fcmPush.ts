"use client";

import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged, type User } from "firebase/auth";

import { isCapacitorNative } from "@/lib/app/nativeShell";
import { isLocalOutgoingMessageId, tryAlertIncomingMessage } from "@/lib/chat/whipAlertDedupe";
import { playIncomingWhipSound } from "@/lib/chat/whipSound";
import { shouldShowWebForegroundChatPush } from "@/lib/chat/webForegroundPushPolicy";
import { getAnonArrivalPushPreference } from "@/lib/chat/anonArrivalPrefs";
import { areChatNotificationsEnabled } from "@/lib/chat/chatNotificationPrefs";
import { recordNotificationStage } from "@/lib/chat/notificationIncident";
import {
  clearPendingUnregister,
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

/** Receive data-only FCM while a web page is foregrounded. The nested chat
 * service worker handles background push; it cannot replace this page listener.
 * Shared message-id dedupe keeps Firestore listeners from showing twice. */
async function attachWebForegroundMessagingListener() {
  if (webForegroundMessagingUnsubscribe || isCapacitorNative()) return;
  const { getMessaging, onMessage } = await import("firebase/messaging");
  webForegroundMessagingUnsubscribe = onMessage(getMessaging(app), (payload) => {
    const data = payload.data || {};
    const viewerUid = asId(auth.currentUser?.uid);
    // Profile-arrival FCM events must not enter the chat-only message filter.
    // Anonymous foreground entries already have a separate Firestore toast.
    if (data.type === "profile_arrival" || (data.type === "anon_arrival" && data.source === "manual_admin")) {
      if (!getAnonArrivalPushPreference(viewerUid)) return;
      const href = arrivalActionHref(data);
      if (!href) return;
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
            data: { type: asId(data.type), href },
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

export async function setAnonArrivalPushEnabled(enabled: boolean): Promise<boolean> {
  const current = auth.currentUser;
  if (!current) return false;
  let persisted = readPersistedDeviceToken();
  if (enabled && (persisted.uid !== current.uid || !persisted.token)) {
    const result = isCapacitorNative()
      ? await enableNativeChatPush(current)
      : await enableWebChatPush(current);
    if (!result.ok) return false;
    persisted = readPersistedDeviceToken();
  }
  if (persisted.uid !== current.uid || !persisted.token) return !enabled;
  try {
    const fn = httpsCallable(functions, "setAnonArrivalPush");
    const response = await fn({ token: persisted.token, enabled });
    return (response.data as { ok?: boolean })?.ok === true;
  } catch (error) {
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
      setFcmRegistrationState(cleanUid, { status: "error", error: "callable_failed" });
      return result;
    }
    if (liveAuthUid() !== cleanUid) return { ok: false, reason: "stale" };
    registeredToken = cleanToken;
    registeredUid = cleanUid;
    persistDeviceToken(cleanUid, cleanToken);
    if (getAnonArrivalPushPreference(cleanUid)) {
      // Rejoin the opt-in topic when Firebase rotates an installation token.
      void setAnonArrivalPushEnabled(true);
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
  const type = asId(data.type);
  const principal = type === "anon_arrival" ? asId(data.anonId) : asId(data.username).toLowerCase();
  return type + ":" + (principal || asId(data.tag)) + (asId(data.source) === "manual_admin" ? ":admin" : "");
}
function arrivalActionHref(data: Record<string, unknown>) {
  const type = asId(data.type);
  if (type === "anon_arrival") {
    const id = asId(data.anonId);
    return /^anon_[a-z0-9_]{6,80}$/i.test(id)
      ? "/?anonArrival=" + encodeURIComponent(id) : "";
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
      const token = asId(
        await getToken(getMessaging(app), {
          serviceWorkerRegistration: registration,
          ...(vapidKey ? { vapidKey } : {}),
        }),
      );
      if (!token) {
        recordNotificationStage("web_fcm_token", false, "empty");
        return { ok: false, reason: "token", message: "empty_token" };
      }

      const upserted = await upsertFcmTokenForUser(uid, token);
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
  })().finally(() => {
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
