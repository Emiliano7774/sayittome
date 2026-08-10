"use client";

import { isCapacitorNative, isNativeAppActive } from "@/lib/app/nativeShell";
import { areChatNotificationsEnabled } from "@/lib/chat/chatNotificationPrefs";

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

export async function requestChatNotificationPermission() {
  if (typeof window === "undefined") return false;
  if (!areChatNotificationsEnabled()) return false;
  if (permissionRequested) {
    return hasChatNotificationPermission();
  }

  permissionRequested = true;
  await initChatNotifications();

  if (isCapacitorNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const current = await LocalNotifications.checkPermissions();
      if (current.display === "granted") {
        nativePermissionGranted = true;
        return true;
      }
      const requested = await LocalNotifications.requestPermissions();
      nativePermissionGranted = requested.display === "granted";
      return nativePermissionGranted;
    } catch {
      return false;
    }
  }

  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "default") return false;

  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
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
