import { isAndroidDevice, isCapacitorNative } from "@/lib/app/nativeShell";
import {
  STORY_NOTIF_CHANNEL_ID,
  STORY_NOTIF_COLOR,
  sanitizeStoryNotificationHref,
} from "@/lib/stories/storyNotificationPolicy";

function storyNotificationId(tag: string) {
  const raw = String(tag || "story").trim();
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1_900_000_000) + 1;
}

export async function ensureStoryNotificationChannel() {
  if (!isCapacitorNative()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.createChannel({
      id: STORY_NOTIF_CHANNEL_ID,
      name: "Historias",
      description: "Likes e historias nuevas",
      importance: 5,
      vibration: true,
      visibility: 1,
      sound: "default",
    });
    return true;
  } catch {
    return false;
  }
}

async function androidHasNativeStoryBanner() {
  if (!isCapacitorNative() || !isAndroidDevice()) return false;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return Number(info.build || 0) >= 150;
  } catch {
    return false;
  }
}

/** Old APKs have no story renderer — show a local banner. APK 150+ draws it natively. */
export async function presentStoryForegroundNotification(input: {
  title?: string;
  body?: string;
  href?: string;
  tag?: string;
}) {
  if (typeof window === "undefined") return false;
  if (await androidHasNativeStoryBanner()) return false;
  const title = String(input.title || "").trim();
  const body = String(input.body || "").trim();
  if (!title && !body) return false;
  const href = sanitizeStoryNotificationHref(String(input.href || ""));
  const tag = String(input.tag || href || "story").trim();

  if (isCapacitorNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted") return false;
      await ensureStoryNotificationChannel();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: storyNotificationId(tag),
            title: title || "SayItToMe",
            body: body || title,
            channelId: STORY_NOTIF_CHANNEL_ID,
            sound: "default",
            smallIcon: "ic_stat_notify",
            iconColor: STORY_NOTIF_COLOR,
            extra: { type: "story_like", href, tag },
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }

  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  try {
    const banner = new Notification(title || "SayItToMe", {
      body: body || title,
      tag,
      icon: "/icons/Icon-192.png",
    });
    banner.onclick = () => {
      if (href) window.location.assign(href);
      banner.close();
    };
    return true;
  } catch {
    return false;
  }
}
