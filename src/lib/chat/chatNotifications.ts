"use client";

import { isCapacitorNative, isNativeAppActive } from "@/lib/app/nativeShell";
import {
  areChatNotificationsEnabled,
  syncChatNotificationPrefsFromBrowserPermission,
} from "@/lib/chat/chatNotificationPrefs";
import { recordNotificationStage } from "@/lib/chat/notificationIncident";
import {
  buildChatNotificationOpenHref,
  markChatOpenedFromNotification,
} from "@/lib/chat/chatNotificationOpen";
import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";
import { deliverWebChatNotification } from "@/lib/chat/webNotificationDelivery";

const CHAT_CHANNEL_ID = "chat-messages";
const ANON_MATCH_CHANNEL_ID = "anon-match-requests";
const ICON_PATH = "/icons/Icon-192.png";
const NOTIFY_SMALL_ICON = "ic_stat_notify";
const NOTIFY_LARGE_ICON = "ic_notify_moon";
const NOTIFY_ICON_COLOR = "#7C3AED";
/** Nested scope — must not steal control of `/` from Monetag's public/sw.js. */
const CHAT_NOTIFY_SW_URL = "/chat-notify/sw.js";
const CHAT_NOTIFY_SW_SCOPE = "/chat-notify/";
const CHAT_NOTIFY_SW_SCRIPT_MARKER = "/chat-notify/sw.js";

let bootstrapped = false;
let permissionRequested = false;
let nativePermissionGranted = false;
let actionListenerAttached = false;
let chatNotifyRegistration: ServiceWorkerRegistration | null = null;
let chatNotifyRegisterPromise: Promise<ServiceWorkerRegistration | null> | null =
  null;
const webAnonMatchNotifications = new Map<string, Notification>();
/** Retain page Notification instances — desktop Chrome can GC unreferenced banners. */
const webChatNotifications = new Map<string, Notification>();

function registrationScriptURL(registration: ServiceWorkerRegistration) {
  return (
    registration.active?.scriptURL ||
    registration.waiting?.scriptURL ||
    registration.installing?.scriptURL ||
    ""
  );
}

/**
 * Monetag owns scope `/`. `getRegistration("/chat-notify/")` still returns that
 * root registration when our nested SW is missing — longest-prefix match. Never
 * treat Monetag as the chat-notify worker.
 */
function isChatNotifyRegistration(
  registration: ServiceWorkerRegistration | null | undefined,
): boolean {
  if (!registration) return false;
  const script = registrationScriptURL(registration);
  if (script.includes(CHAT_NOTIFY_SW_SCRIPT_MARKER)) return true;
  try {
    const scopePath = new URL(registration.scope, window.location.origin).pathname;
    return (
      scopePath === CHAT_NOTIFY_SW_SCOPE ||
      scopePath === "/chat-notify"
    );
  } catch {
    return false;
  }
}

async function waitForServiceWorkerActive(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorkerRegistration | null> {
  if (registration.active) return registration;
  const worker = registration.installing || registration.waiting;
  if (!worker) return registration.active ? registration : null;
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", onState);
      resolve();
    };
    const onState = () => {
      if (worker.state === "activated" || worker.state === "redundant") {
        finish();
      }
    };
    const timer = setTimeout(finish, 5000);
    worker.addEventListener("statechange", onState);
    if (worker.state === "activated" || worker.state === "redundant") {
      finish();
    }
  });
  return registration.active ? registration : null;
}

async function findChatNotifyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const all = await navigator.serviceWorker.getRegistrations();
    for (const registration of all) {
      if (isChatNotifyRegistration(registration)) return registration;
    }
  } catch {
    // ignore — fall through to getRegistration
  }
  try {
    const byScope = await navigator.serviceWorker.getRegistration(
      CHAT_NOTIFY_SW_SCOPE,
    );
    if (isChatNotifyRegistration(byScope)) return byScope ?? null;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Own SW for OS banners. Chrome/Brave Android reject `new Notification()`
 * ("Illegal constructor") — only ServiceWorkerRegistration.showNotification works.
 * Do not use navigator.serviceWorker.ready (that is Monetag's controller).
 * Do not trust getRegistration("/chat-notify/") alone — Monetag scope `/` matches.
 */
export async function ensureChatNotifyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  if (
    chatNotifyRegistration?.active &&
    isChatNotifyRegistration(chatNotifyRegistration)
  ) {
    return chatNotifyRegistration;
  }
  if (chatNotifyRegistration && !isChatNotifyRegistration(chatNotifyRegistration)) {
    chatNotifyRegistration = null;
  }
  if (chatNotifyRegisterPromise) return chatNotifyRegisterPromise;

  chatNotifyRegisterPromise = (async () => {
    try {
      const existing = await findChatNotifyRegistration();
      if (existing) {
        // Updating over a slow/offline network must not block a usable worker.
        void existing.update().catch(() => undefined);
        const active = await waitForServiceWorkerActive(existing);
        if (active?.active && isChatNotifyRegistration(active)) {
          chatNotifyRegistration = active;
          recordNotificationStage("chat_notify_sw", true, "existing");
          return active;
        }
      }

      const registered = await navigator.serviceWorker.register(
        CHAT_NOTIFY_SW_URL,
        { scope: CHAT_NOTIFY_SW_SCOPE, updateViaCache: "none" },
      );
      if (!isChatNotifyRegistration(registered)) {
        recordNotificationStage("chat_notify_sw", false, "wrong_script");
        return null;
      }
      const active = await waitForServiceWorkerActive(registered);
      chatNotifyRegistration =
        active?.active && isChatNotifyRegistration(active) ? active : null;
      recordNotificationStage(
        "chat_notify_sw",
        Boolean(chatNotifyRegistration?.active),
        chatNotifyRegistration?.active ? "registered" : "inactive",
      );
      return chatNotifyRegistration;
    } catch (error) {
      recordNotificationStage(
        "chat_notify_sw",
        false,
        String((error as Error)?.name || "err"),
      );
      return null;
    } finally {
      chatNotifyRegisterPromise = null;
    }
  })();

  return chatNotifyRegisterPromise;
}

function pageNotificationConstructorSupported() {
  if (typeof window === "undefined" || typeof Notification !== "function") {
    return false;
  }
  // Chrome/Brave/Edge on Android: constructor throws Illegal constructor.
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return false;
  return true;
}

/** Stable numeric id from an opaque key (prefer messageId so banners do not replace). */
export function stableNotificationId(key: string) {
  const raw = String(key || "").trim();
  if (!raw) return Math.floor(Math.random() * 2_000_000_000);
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1_900_000_000) + 1;
}

export function chatNotificationTag(input: { chatId?: string; messageId?: string }) {
  const chatId = String(input.chatId || "").trim();
  if (chatId) return `sayittome-chat-${chatId}`;
  const messageId = String(input.messageId || "").trim();
  return messageId ? `sayittome-msg-${messageId}` : "sayittome-chat";
}

function notificationBody(input: { body?: string; mediaHint?: string }) {
  const body = String(input.body || "").trim();
  if (body) return body.slice(0, 180);
  return String(input.mediaHint || "Nuevo mensaje").trim() || "Nuevo mensaje";
}

function openChatFromNotification(input: {
  chatId: string;
  messageId?: string;
  body?: string;
  title?: string;
}) {
  const id = String(input.chatId || "").trim();
  if (!id || typeof window === "undefined") return;
  markChatOpenedFromNotification({
    chatId: id,
    messageId: input.messageId,
    body: input.body,
    title: input.title,
  });
  prefetchChatThread(id);
  window.location.assign(
    buildChatNotificationOpenHref({
      chatId: id,
      messageId: input.messageId,
    }),
  );
}

async function ensureNativeChannel() {
  if (!isCapacitorNative()) return;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.createChannel({
      id: CHAT_CHANNEL_ID,
      name: "Mensajes",
      description: "Avisos cuando llega un mensaje nuevo",
      importance: 5,
      vibration: true,
      sound: "default",
      visibility: 1,
    });
    await LocalNotifications.createChannel({
      id: ANON_MATCH_CHANNEL_ID,
      name: "Coincidencias anónimas",
      description: "Avisos para aceptar una coincidencia de chat anónimo",
      importance: 5,
      vibration: true,
      sound: "default",
      visibility: 1,
    });
  } catch {
    // Plugin unavailable.
  }
}

function anonMatchNotificationId(requestId: string) {
  return stableNotificationId(`anon-match:${String(requestId || "").trim()}`);
}

/**
 * Match invitations are transactional, not an optional message preference.
 * The in-app modal/sound always run; this adds an OS banner when the operating
 * system has already granted permission. Browser/Android denial is respected.
 */
export async function showRequiredAnonMatchNotification(input: {
  requestId: string;
  title: string;
  body: string;
}) {
  if (typeof window === "undefined") return false;
  const requestId = String(input.requestId || "").trim();
  if (!requestId) return false;

  await initChatNotifications();
  const title = String(input.title || "Encontramos un chat").trim();
  const body = notificationBody({ body: input.body });

  if (isCapacitorNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted") return false;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: anonMatchNotificationId(requestId),
            title,
            body,
            channelId: ANON_MATCH_CHANNEL_ID,
            sound: "default",
            smallIcon: NOTIFY_SMALL_ICON,
            largeIcon: NOTIFY_LARGE_ICON,
            iconColor: NOTIFY_ICON_COLOR,
            extra: { kind: "anon-match", requestId },
          },
        ],
      });
      return true;
    } catch {
      // Fall through to the Web Notification API when available.
    }
  }

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }

  try {
    webAnonMatchNotifications.get(requestId)?.close();
    const notification = new Notification(title, {
      body,
      tag: `sayittome-anon-match-${requestId}`,
      icon: ICON_PATH,
      silent: false,
      data: { kind: "anon-match", requestId },
    });
    webAnonMatchNotifications.set(requestId, notification);
    notification.onclose = () => webAnonMatchNotifications.delete(requestId);
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}

export async function dismissRequiredAnonMatchNotification(requestId: string) {
  if (typeof window === "undefined") return;
  const id = String(requestId || "").trim();
  if (!id) return;

  webAnonMatchNotifications.get(id)?.close();
  webAnonMatchNotifications.delete(id);

  if (!isCapacitorNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({
      notifications: [{ id: anonMatchNotificationId(id) }],
    });
  } catch {
    // Notification may already be gone or the plugin may be unavailable.
  }
}

async function attachNativeActionListener() {
  if (!isCapacitorNative() || actionListenerAttached) return;
  actionListenerAttached = true;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      const extra = (event.notification?.extra || {}) as Record<string, unknown>;
      const chatId = String(extra.chatId || "").trim();
      if (!chatId) return;
      openChatFromNotification({
        chatId,
        messageId: String(extra.messageId || "").trim(),
        body: String(event.notification?.body || "").trim(),
        title: String(event.notification?.title || "").trim(),
      });
    });
  } catch {
    actionListenerAttached = false;
  }
}

function attachChatNotifySwMessageListener() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = (event.data || {}) as {
      type?: string;
      url?: string;
      chatId?: string;
      messageId?: string;
    };
    if (data.type !== "sayittome:chat-notification-open") return;
    const chatId = String(data.chatId || "").trim();
    const href = String(data.url || "").trim();
    if (chatId) {
      openChatFromNotification({
        chatId,
        messageId: String(data.messageId || "").trim(),
      });
      return;
    }
    if (href) {
      try {
        window.location.assign(href);
      } catch {
        // ignore
      }
    }
  });
}

export async function initChatNotifications() {
  if (bootstrapped || typeof window === "undefined") return;
  bootstrapped = true;
  syncChatNotificationPrefsFromBrowserPermission();
  await ensureNativeChannel();
  await attachNativeActionListener();
  if (!isCapacitorNative()) {
    attachChatNotifySwMessageListener();
    void ensureChatNotifyServiceWorker();
  }

  if (isCapacitorNative() && areChatNotificationsEnabled()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const current = await LocalNotifications.checkPermissions();
      nativePermissionGranted = current.display === "granted";
    } catch {
      nativePermissionGranted = false;
    }
  }
}

export async function requestChatNotificationPermission(options?: {
  force?: boolean;
}) {
  if (typeof window === "undefined") return false;
  if (!areChatNotificationsEnabled()) return false;

  await initChatNotifications();

  recordNotificationStage("capacitor_native", isCapacitorNative(), isCapacitorNative() ? "1" : "0");

  if (isCapacitorNative()) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { LocalNotifications } = await import("@capacitor/local-notifications");

      let push = await PushNotifications.checkPermissions();
      recordNotificationStage("push_check", true, String(push.receive || "empty"));
      if (push.receive !== "granted") {
        if (permissionRequested && !options?.force && push.receive !== "prompt") {
          nativePermissionGranted = false;
          return false;
        }
        permissionRequested = true;
        push = await PushNotifications.requestPermissions();
        recordNotificationStage("push_request", push.receive === "granted", String(push.receive || "empty"));
      }

      let local = await LocalNotifications.checkPermissions();
      recordNotificationStage("local_check", true, String(local.display || "empty"));
      if (local.display !== "granted") {
        permissionRequested = true;
        local = await LocalNotifications.requestPermissions();
        recordNotificationStage("local_request", local.display === "granted", String(local.display || "empty"));
      }

      nativePermissionGranted = push.receive === "granted" || local.display === "granted";
      recordNotificationStage("permission_result", nativePermissionGranted, `push:${push.receive}|local:${local.display}`);
      return nativePermissionGranted;
    } catch (error) {
      recordNotificationStage("native_permission_throw", false, String((error as Error)?.name || "err"));
      return false;
    }
  }

  if (!("Notification" in window)) {
    recordNotificationStage("web_notification_api", false, "missing");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "default" && !options?.force) return false;
  if (Notification.permission !== "default") return false;

  try {
    permissionRequested = true;
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export function resetChatNotificationPermissionLatch() {
  permissionRequested = false;
}

export function hasChatNotificationPermission() {
  if (typeof window === "undefined") return false;

  if (isCapacitorNative()) {
    return nativePermissionGranted;
  }

  return "Notification" in window && Notification.permission === "granted";
}

export function shouldShowBackgroundChatNotification() {
  if (typeof document === "undefined") return false;
  if (document.hidden) return true;
  return isCapacitorNative() && !isNativeAppActive();
}

export function shouldShowChatNotification(input?: { viewingActiveChat?: boolean }) {
  if (!areChatNotificationsEnabled()) return false;
  // Web users asked for an OS notification for every received message,
  // including a message that arrives in the thread currently on screen.
  // Native keeps its existing active-thread suppression to avoid a duplicate
  // local alert while FCM owns delivery.
  if (input?.viewingActiveChat && isCapacitorNative()) return false;
  if (shouldShowBackgroundChatNotification()) return true;
  // Native shell: also notify when the app is open on another screen.
  if (isCapacitorNative() && isNativeAppActive()) return true;
  // Web: show the OS banner on every incoming message, including while viewing
  // the same thread. Background tabs use document.hidden above.
  return !isCapacitorNative();
}

export async function showChatNotification(input: {
  title: string;
  body: string;
  chatId?: string;
  messageId?: string;
  viewingActiveChat?: boolean;
}) {
  if (typeof window === "undefined") return;
  if (!shouldShowChatNotification({ viewingActiveChat: input.viewingActiveChat })) return;

  const body = notificationBody({ body: input.body });
  const title = String(input.title || "Nuevo mensaje").trim() || "Nuevo mensaje";
  const chatId = String(input.chatId || "").trim();
  const messageId = String(input.messageId || "").trim();
  const idKey = messageId || `${chatId}:${body}:${title}`;
  const tag = chatNotificationTag({ chatId, messageId });
  const group = chatId ? `chat-${chatId}` : "chat";

  // Native FCM owns OS notifications once a token is registered (avoids double banners).
  if (isCapacitorNative()) {
    const { shouldSuppressLocalOsNotification } = await import("@/lib/chat/fcmPush");
    if (shouldSuppressLocalOsNotification()) return;
  }

  if (isCapacitorNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted") return;

      const background = shouldShowBackgroundChatNotification();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: stableNotificationId(idKey),
            title,
            body,
            channelId: CHAT_CHANNEL_ID,
            // Foreground: in-app whip owns audio — avoid double sound with channel.
            ...(background ? { sound: "default" as const } : {}),
            smallIcon: NOTIFY_SMALL_ICON,
            largeIcon: NOTIFY_LARGE_ICON,
            iconColor: NOTIFY_ICON_COLOR,
            group,
            extra: {
              chatId,
              messageId,
              group,
            },
          },
        ],
      });
      return;
    } catch {
      // Fall through to web Notification API when available.
    }
  }

  if (!("Notification" in window)) {
    recordNotificationStage("web_notification_api", false, "missing");
    return;
  }
  if (Notification.permission !== "granted") {
    recordNotificationStage("web_permission", false, String(Notification.permission));
    return;
  }

  const onClick = () => {
    if (chatId) {
      openChatFromNotification({
        chatId,
        messageId,
        body,
        title,
      });
    }
    try {
      window.focus();
    } catch {
      // ignore
    }
  };

  const notificationOptions: NotificationOptions & { renotify: boolean } = {
    body,
    tag,
    icon: ICON_PATH,
    silent: false,
    renotify: true,
    data: { chatId, messageId, group },
  };

  const showPageNotification = () => {
    if (!pageNotificationConstructorSupported()) {
      throw new Error("page_notification_unsupported");
    }
    webChatNotifications.get(tag)?.close();
    const notification = new Notification(title, notificationOptions);
    webChatNotifications.set(tag, notification);
    notification.onclose = () => {
      if (webChatNotifications.get(tag) === notification) {
        webChatNotifications.delete(tag);
      }
    };
    notification.onclick = () => {
      onClick();
      notification.close();
    };
  };

  const showViaServiceWorker = async () => {
    // Prefer our scoped chat SW — Monetag /sw.js was silent/unreliable for chat.
    const own = await ensureChatNotifyServiceWorker();
    if (
      own?.active &&
      isChatNotifyRegistration(own) &&
      typeof own.showNotification === "function"
    ) {
      await deliverWebChatNotification(own, title, notificationOptions);
      recordNotificationStage("web_show", true, "chat-notify-sw");
      return true;
    }

    // Last resort: any other active registration (e.g. Monetag). Never prefer
    // it when our SW exists — getRegistration() without URL returns Monetag.
    const getRegistration = navigator.serviceWorker?.getRegistration?.bind(
      navigator.serviceWorker,
    );
    if (!getRegistration) return false;
    const fallback = await getRegistration();
    if (
      !fallback?.active ||
      isChatNotifyRegistration(fallback) ||
      typeof fallback.showNotification !== "function"
    ) {
      return false;
    }
    await fallback.showNotification(title, notificationOptions);
    recordNotificationStage("web_show", true, "fallback-sw");
    return true;
  };

  try {
    // Android Chrome/Brave: only SW showNotification works. Desktop: SW first
    // too (focused + background). Page Notification is desktop-only fallback.
    const shown = await showViaServiceWorker().catch((error) => {
      recordNotificationStage(
        "web_show",
        false,
        `sw:${String((error as Error)?.message || (error as Error)?.name || "err").slice(0, 80)}`,
      );
      return false;
    });
    if (shown) return;
    showPageNotification();
    recordNotificationStage("web_show", true, "page");
  } catch {
    try {
      const shown = await showViaServiceWorker().catch(() => false);
      if (!shown) {
        recordNotificationStage("web_show", false, "all_paths");
      }
    } catch {
      recordNotificationStage("web_show", false, "blocked");
    }
  }
}
