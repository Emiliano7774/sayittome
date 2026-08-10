"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { useT } from "@/contexts/LocaleContext";
import { isCapacitorNative } from "@/lib/app/nativeShell";
import {
  requestChatNotificationPermission,
  resetChatNotificationPermissionLatch,
} from "@/lib/chat/chatNotifications";
import { deleteCurrentDeviceFcmToken, registerNativePushIfEnabled } from "@/lib/chat/fcmPush";
import {
  areChatNotificationsEnabled,
  getChatNotificationPrefsVersion,
  setChatNotificationsEnabled,
  subscribeChatNotificationPrefs,
} from "@/lib/chat/chatNotificationPrefs";

type Props = {
  variant?: "classic" | "modern";
};

type OsPermission = "unknown" | "granted" | "denied" | "prompt";

async function readOsPermission(): Promise<OsPermission> {
  try {
    if (isCapacitorNative()) {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const current = await PushNotifications.checkPermissions();
      const receive = String(current.receive || "");
      if (receive === "granted") return "granted";
      if (receive === "denied") return "denied";
      return "prompt";
    }
    if (typeof Notification !== "undefined") {
      if (Notification.permission === "granted") return "granted";
      if (Notification.permission === "denied") return "denied";
      return "prompt";
    }
  } catch {
    // ignore
  }
  return "unknown";
}

export default function ChatNotificationSetting({ variant = "modern" }: Props) {
  const t = useT();
  const enabled = useSyncExternalStore(
    subscribeChatNotificationPrefs,
    areChatNotificationsEnabled,
    () => false,
  );

  useSyncExternalStore(
    subscribeChatNotificationPrefs,
    getChatNotificationPrefsVersion,
    () => "0-0",
  );

  const [osPermission, setOsPermission] = useState<OsPermission>("unknown");

  useEffect(() => {
    let cancelled = false;
    void readOsPermission().then((next) => {
      if (!cancelled) setOsPermission(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  async function toggleEnabled() {
    const next = !enabled;
    if (!next) {
      setChatNotificationsEnabled(false);
      await deleteCurrentDeviceFcmToken();
      setOsPermission(await readOsPermission());
      return;
    }

    setChatNotificationsEnabled(true);
    resetChatNotificationPermissionLatch();
    const granted = await requestChatNotificationPermission({ force: true });
    if (!granted) {
      setChatNotificationsEnabled(false);
      setOsPermission(await readOsPermission());
      return;
    }
    await registerNativePushIfEnabled();
    setOsPermission(await readOsPermission());
  }

  const osLabel =
    osPermission === "granted"
      ? t("chat_notifications_os_granted")
      : osPermission === "denied"
        ? t("chat_notifications_os_denied")
        : osPermission === "prompt"
          ? t("chat_notifications_os_prompt")
          : t("chat_notifications_os_unknown");

  if (variant === "classic") {
    return (
      <div className="border-b border-white/18 pb-8 mb-8">
        <p className="text-white/55 text-sm font-black uppercase tracking-wide mb-4">
          {t("chat_notifications_label")}
        </p>
        <p className="text-white/35">{t("chat_notifications_hint")}</p>
        <p className="mt-2 text-xs text-white/45">{osLabel}</p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => void toggleEnabled()}
            className={`px-5 py-3 rounded-full font-black ${
              enabled ? "bg-white text-black" : "bg-[#6C63FF] text-white"
            }`}
          >
            {enabled ? t("chat_notifications_enabled") : t("chat_notifications_enable_cta")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="block">
      <span className="text-sm font-black text-white/70">{t("chat_notifications_label")}</span>
      <div className="mt-3 rounded-[1.25rem] border border-violet-400/35 bg-violet-500/10 px-4 py-4">
        <p className="text-sm text-zinc-300">{t("chat_notifications_hint")}</p>
        <p className="mt-2 text-xs text-white/55">{osLabel}</p>
        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            onClick={() => void toggleEnabled()}
            className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-black ${
              enabled ? "bg-violet-500 text-white" : "bg-[#6C63FF] text-white shadow-[0_0_24px_rgba(108,99,255,.35)]"
            }`}
          >
            {enabled ? t("chat_notifications_enabled") : t("chat_notifications_enable_cta")}
          </button>
        </div>
      </div>
    </div>
  );
}
