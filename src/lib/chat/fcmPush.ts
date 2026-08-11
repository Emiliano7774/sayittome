"use client";

import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged, type User } from "firebase/auth";

import { isCapacitorNative } from "@/lib/app/nativeShell";
import { areChatNotificationsEnabled } from "@/lib/chat/chatNotificationPrefs";
import { recordNotificationStage } from "@/lib/chat/notificationIncident";
import { auth, functions } from "@/lib/firebase";

const FCM_CHANNEL_ID = "chat-messages-v2";
const INSTALLATION_KEY = "sayittome:fcm-installation-id";
const PERSISTED_TOKEN_KEY = "sayittome:fcm-device-token";
const PERSISTED_UID_KEY = "sayittome:fcm-device-uid";

let bootstrapped = false;
let registeredToken: string | null = null;
let registeredUid: string | null = null;
let pendingChatId: string | null = null;
let authUnsub: (() => void) | null = null;
let tokenWaiters: Array<(token: string) => void> = [];

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

function readInstallationId() {
  if (typeof window === "undefined") return "web";
  try {
    const existing = window.localStorage.getItem(INSTALLATION_KEY);
    if (existing) return existing;
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `inst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(INSTALLATION_KEY, next);
    return next;
  } catch {
    return `inst_${Date.now()}`;
  }
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

export async function upsertFcmTokenForUser(uid: string, token: string) {
  const cleanUid = asId(uid);
  const cleanToken = asId(token);
  if (!cleanUid || !cleanToken) return;

  const register = httpsCallable(functions, "registerFcmToken");
  await register({
    token: cleanToken,
    installationId: readInstallationId(),
    platform: "android",
  });

  registeredToken = cleanToken;
  registeredUid = cleanUid;
  persistDeviceToken(cleanUid, cleanToken);
}

export async function deleteCurrentDeviceFcmToken(
  uid = registeredUid || auth.currentUser?.uid || "",
) {
  const persisted = readPersistedDeviceToken();
  const cleanUid = asId(uid || persisted.uid);
  const token = asId(registeredToken || persisted.token);

  registeredToken = null;
  registeredUid = null;
  clearPersistedDeviceToken();

  if (!cleanUid || !token) return;

  try {
    const unregister = httpsCallable(functions, "unregisterFcmToken");
    await unregister({ token });
  } catch {
    // Best-effort purge on logout / disable.
  }
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
    const uid = auth.currentUser?.uid;
    if (!token) return;
    registeredToken = token;
    notifyTokenWaiters(token);
    recordNotificationStage("registration_event", true, "token_present");
    if (!uid) return;
    void upsertFcmTokenForUser(uid, token);
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
      reason: "denied" | "no_auth" | "register" | "token" | "callable" | "prefs";
      message: string;
    };

export async function registerNativePushIfEnabled(user?: User | null) {
  const result = await enableNativeChatPush(user);
  return result.ok;
}

export async function enableNativeChatPush(user?: User | null): Promise<PushEnableResult> {
  recordNotificationStage("enable_start", true, isCapacitorNative() ? "native" : "web");
  if (!isCapacitorNative() || typeof window === "undefined") {
    recordNotificationStage("enable_not_native", false, "not_native");
    return { ok: false, reason: "register", message: "not_native" };
  }
  if (!areChatNotificationsEnabled()) {
    recordNotificationStage("enable_prefs", false, "prefs_off");
    return { ok: false, reason: "prefs", message: "prefs_off" };
  }

  const uid = asId(user?.uid || auth.currentUser?.uid);
  recordNotificationStage("enable_auth_uid", Boolean(uid), uid ? "present" : "missing");
  if (!uid) {
    return { ok: false, reason: "no_auth", message: "missing_uid" };
  }

  if (!bootstrapped) {
    await initNativePushNotifications();
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
    await upsertFcmTokenForUser(uid, token);
    recordNotificationStage("enable_callable_registerFcmToken", true, "ok");
  } catch (error) {
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

export async function initNativePushNotifications() {
  if (bootstrapped || typeof window === "undefined") return;
  if (!isCapacitorNative()) return;
  bootstrapped = true;

  await attachPushListeners();
  await ensurePushChannel();

  if (!authUnsub) {
    authUnsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        registeredUid = null;
        return;
      }
      if (areChatNotificationsEnabled()) {
        void registerNativePushIfEnabled(user);
      }
      const pending = drainQueuedPushChatId();
      if (pending && user.uid) {
        window.location.assign(`/chat/${encodeURIComponent(pending)}`);
      }
    });
  }

  if (areChatNotificationsEnabled() && auth.currentUser) {
    await registerNativePushIfEnabled(auth.currentUser);
  }
}

/** Native + FCM token active → OS notifs come from FCM; skip LocalNotifications. */
export function shouldSuppressLocalOsNotification() {
  return isCapacitorNative() && hasActiveFcmRegistration();
}

export { FCM_CHANNEL_ID };
