"use client";

import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged, type User } from "firebase/auth";

import { isCapacitorNative } from "@/lib/app/nativeShell";
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
import { auth, functions } from "@/lib/firebase";

const FCM_CHANNEL_ID = "chat-messages-v2";
const INSTALLATION_KEY = "sayittome:fcm-installation-id";
const INSTALLATION_SECRET_KEY = "sayittome:fcm-installation-secret";
const PERSISTED_TOKEN_KEY = "sayittome:fcm-device-token";
const PERSISTED_UID_KEY = "sayittome:fcm-device-uid";

let bootstrapped = false;
let registeredToken: string | null = null;
let registeredUid: string | null = null;
let pendingChatId: string | null = null;
let authUnsub: (() => void) | null = null;
let tokenWaiters: Array<(token: string) => void> = [];
const enableInFlightByUid = new Map<string, Promise<PushEnableResult>>();
let initInFlight: Promise<void> | null = null;
let authCallbackChain: Promise<void> = Promise.resolve();

function notifyTokenWaiters(token: string) {
  const waiters = tokenWaiters;
  tokenWaiters = [];
  for (const waiter of waiters) waiter(token);
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
        platform: "android",
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

    await invalidateLocalNativeRegistration();

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
  } catch {
    // Channel creation is best-effort; FCM may fall back to default.
  }
}

function openChatDeepLink(chatId: string) {
  const id = asId(chatId);
  if (!id || typeof window === "undefined") return;

  if (!auth.currentUser) {
    queuePushChatId(id);
    return;
  }

  window.location.assign(`/chat/${encodeURIComponent(id)}`);
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

  await PushNotifications.addListener("pushNotificationReceived", () => {
    // Foreground: in-app whip owns UX. Avoid double OS sound.
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
    const data = (event.notification?.data || {}) as Record<string, unknown>;
    const chatId = asId(data.chatId);
    if (chatId) openChatDeepLink(chatId);
  });
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
        | "stale"
        | "cancelled";
      message: string;
    };

export async function registerNativePushIfEnabled(user?: User | null) {
  const result = await enableNativeChatPush(user);
  return result.ok;
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

  if (!areChatNotificationsEnabled()) {
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
            if (areChatNotificationsEnabled()) {
              await registerNativePushIfEnabled(user);
            } else {
              await flushPendingFcmUnregister();
            }
            const pendingChat = drainQueuedPushChatId();
            if (pendingChat && user.uid) {
              window.location.assign(`/chat/${encodeURIComponent(pendingChat)}`);
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
  if (areChatNotificationsEnabled() && auth.currentUser) {
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
  if (!user || !areChatNotificationsEnabled()) {
    await flushPendingFcmUnregister();
    return;
  }
  await registerNativePushIfEnabled(user);
}
