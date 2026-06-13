"use client";

import { isCapacitorNative, isNativeAppActive } from "@/lib/app/nativeShell";

const CHAT_CHANNEL_ID = "chat-messages";
const ICON_PATH = "/icons/Icon-192.png";

let bootstrapped = false;
let permissionRequested = false;
let nativePermissionGranted = false;

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

export async function initChatNotifications() {
  if (bootstrapped || typeof window === "undefined") return;
  bootstrapped = true;
  await ensureNativeChannel();
}

export async function requestChatNotificationPermission() {
  if (typeof window === "undefined") return false;
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

export async function showChatNotification(input: {
  title: string;
  body: string;
  chatId?: string;
}) {
  if (typeof window === "undefined") return;
  if (!shouldShowBackgroundChatNotification()) return;

  const body = String(input.body || "").trim();
  if (!body) return;

  const title = String(input.title || "Nuevo mensaje").trim() || "Nuevo mensaje";

  if (isCapacitorNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted") return;

      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2_000_000_000),
            title,
            body: body.slice(0, 180),
            channelId: CHAT_CHANNEL_ID,
            sound: "default",
            smallIcon: "ic_launcher_foreground",
            extra: {
              chatId: input.chatId || "",
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
    new Notification(title, {
      body: body.slice(0, 180),
      tag: input.chatId ? `sayittome-chat-${input.chatId}` : "sayittome-chat",
      icon: ICON_PATH,
      silent: false,
    });
  } catch {
    // Permission revoked or blocked.
  }
}
