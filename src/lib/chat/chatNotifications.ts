"use client";

import { isCapacitorNative, isNativeAppActive } from "@/lib/app/nativeShell";
import { areChatNotificationsEnabled } from "@/lib/chat/chatNotificationPrefs";
import { recordNotificationStage } from "@/lib/chat/notificationIncident";

const CHAT_CHANNEL_ID = "chat-messages";
const ICON_PATH = "/icons/Icon-192.png";

let bootstrapped = false;
let permissionRequested = false;
let nativePermissionGranted = false;
let actionListenerAttached = false;

function stableNotificationId(chatId: string) {
  const raw = String(chatId || "").trim();
  if (!raw) return Math.floor(Math.random() * 2_000_000_000);
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1_900_000_000) + 1;
}

function notificationBody(input: { body?: string; mediaHint?: string }) {
  const body = String(input.body || "").trim();
  if (body) return body.slice(0, 180);
  return String(input.mediaHint || "Nuevo mensaje").trim() || "Nuevo mensaje";
}

function openChatFromNotification(chatId: string) {
  const id = String(chatId || "").trim();
  if (!id || typeof window === "undefined") return;
  window.location.assign(`/chat/${encodeURIComponent(id)}`);
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
  } catch {
    // Plugin unavailable.
  }
}

async function attachNativeActionListener() {
  if (!isCapacitorNative() || actionListenerAttached) return;
  actionListenerAttached = true;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      const chatId = String(event.notification?.extra?.chatId || "").trim();
      if (chatId) openChatFromNotification(chatId);
    });
  } catch {
    actionListenerAttached = false;
  }
}

export async function initChatNotifications() {
  if (bootstrapped || typeof window === "undefined") return;
  bootstrapped = true;
  await ensureNativeChannel();
  await attachNativeActionListener();

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
  if (input?.viewingActiveChat) return false;
  if (shouldShowBackgroundChatNotification()) return true;
  // Native shell: also notify when the app is open on another screen.
  return isCapacitorNative() && isNativeAppActive();
}

export async function showChatNotification(input: {
  title: string;
  body: string;
  chatId?: string;
  viewingActiveChat?: boolean;
}) {
  if (typeof window === "undefined") return;
  if (!shouldShowChatNotification({ viewingActiveChat: input.viewingActiveChat })) return;

  const body = notificationBody({ body: input.body });
  const title = String(input.title || "Nuevo mensaje").trim() || "Nuevo mensaje";
  const chatId = String(input.chatId || "").trim();

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
            id: stableNotificationId(chatId),
            title,
            body,
            channelId: CHAT_CHANNEL_ID,
            // Foreground: in-app whip owns audio — avoid double sound with channel.
            ...(background ? { sound: "default" as const } : {}),
            smallIcon: "ic_launcher_foreground",
            group: chatId ? `chat-${chatId}` : "chat",
            extra: {
              chatId,
            },
          },
        ],
      });
      return;
    } catch {
      // Fall through to web Notification API when available.
    }
  }

  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notification = new Notification(title, {
      body,
      tag: chatId ? `sayittome-chat-${chatId}` : "sayittome-chat",
      icon: ICON_PATH,
      silent: false,
      data: { chatId },
    });
    notification.onclick = () => {
      if (chatId) openChatFromNotification(chatId);
      try {
        window.focus();
      } catch {
        // ignore
      }
    };
  } catch {
    // Permission revoked or blocked.
  }
}
