"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useT } from "@/contexts/LocaleContext";
import { isCapacitorNative } from "@/lib/app/nativeShell";
import {
  requestChatNotificationPermission,
  resetChatNotificationPermissionLatch,
} from "@/lib/chat/chatNotifications";
import { useAuth } from "@/contexts/AuthContext";
import {
  classifyOsPermission,
  subscribeFcmRegistration,
  type FcmRegistrationState,
  type OsPermissionStage,
} from "@/lib/chat/fcmRegistrationStore";
import {
  deleteCurrentDeviceFcmToken,
  enableNativeChatPush,
  hasActiveFcmRegistration,
  openNativeNotificationSettings,
} from "@/lib/chat/fcmPush";
import {
  beginNotificationIncident,
  notificationIncidentSummary,
} from "@/lib/chat/notificationIncident";
import {
  areChatNotificationsEnabled,
  completeChatNotificationPrompt,
  getChatNotificationPrefsVersion,
  setChatNotificationsEnabled,
  subscribeChatNotificationPrefs,
} from "@/lib/chat/chatNotificationPrefs";

type Props = {
  variant?: "classic" | "modern" | "panel";
};

async function readOsPermission(): Promise<OsPermissionStage> {
  try {
    if (isCapacitorNative()) {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const current = await PushNotifications.checkPermissions();
      return classifyOsPermission(String(current.receive || ""));
    }
    if (typeof Notification !== "undefined") {
      if (Notification.permission === "granted") return "granted";
      if (Notification.permission === "denied") return "denied";
      if (Notification.permission === "default") return "not_asked";
      return "unknown";
    }
  } catch {
    return "error";
  }
  return "unknown";
}

export default function ChatNotificationSetting({ variant = "modern" }: Props) {
  const t = useT();
  const { firebaseUser } = useAuth();
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

  const [osPermission, setOsPermission] = useState<OsPermissionStage>("unknown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tokenForUid, setTokenForUid] = useState<{ uid: string; active: boolean }>({
    uid: "",
    active: false,
  });
  const [regForUid, setRegForUid] = useState<{
    uid: string;
    state: FcmRegistrationState | null;
  }>({ uid: "", state: null });
  const tapLock = useRef(false);
  const uid = String(firebaseUser?.uid || "");
  const regState = uid && regForUid.uid === uid ? regForUid.state : null;
  const tokenActive = Boolean(uid) && tokenForUid.uid === uid && tokenForUid.active;

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeFcmRegistration(uid, (state) => {
      setRegForUid({ uid, state });
    });
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    const refreshOs = () => {
      void readOsPermission().then((next) => {
        if (!cancelled) setOsPermission(next);
      });
    };
    const refreshTokenFromCallback = () => {
      if (!uid) return;
      setTokenForUid({
        uid,
        active: hasActiveFcmRegistration() || regState?.status === "active",
      });
    };
    refreshOs();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshOs();
        refreshTokenFromCallback();
      }
    };
    const onFocus = () => {
      refreshOs();
      refreshTokenFromCallback();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    let removeApp: (() => void) | undefined;
    if (isCapacitorNative()) {
      void import("@capacitor/app").then(({ App }) => {
        if (cancelled) return;
        void App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            refreshOs();
            refreshTokenFromCallback();
          }
        }).then((handle) => {
          if (cancelled) {
            void handle.remove();
            return;
          }
          removeApp = () => {
            void handle.remove();
          };
        });
      });
    }
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      removeApp?.();
    };
  }, [enabled, regState?.status, uid]);

  async function runToggle() {
    if (busy || tapLock.current) return;
    tapLock.current = true;
    setBusy(true);
    setError("");
    beginNotificationIncident();

    try {
      if (enabled) {
        setChatNotificationsEnabled(false);
        await deleteCurrentDeviceFcmToken();
        setTokenForUid({ uid, active: false });
        setOsPermission(await readOsPermission());
        return;
      }

      setChatNotificationsEnabled(true);
      resetChatNotificationPermissionLatch();
      const granted = await requestChatNotificationPermission({ force: true });
      const os = await readOsPermission();
      setOsPermission(os);

      if (!granted || os === "denied") {
        setChatNotificationsEnabled(false);
        completeChatNotificationPrompt(false);
        const fail = notificationIncidentSummary();
        setError(`${t("chat_notifications_error")} (${fail.lastFailStage || os || "denied"})`);
        return;
      }

      if (isCapacitorNative()) {
        const result = await enableNativeChatPush();
        if (!result.ok) {
          setChatNotificationsEnabled(false);
          setTokenForUid({ uid, active: false });
          if (result.reason === "denied") completeChatNotificationPrompt(false);
          setError(`${t("chat_notifications_error")} (${result.reason})`);
          setOsPermission(await readOsPermission());
          return;
        }
        setTokenForUid({ uid, active: true });
        return;
      }

      setTokenForUid({ uid, active: true });
    } catch {
      setChatNotificationsEnabled(false);
      setTokenForUid({ uid, active: false });
      const fail = notificationIncidentSummary();
      setError(`${t("chat_notifications_error")} (${fail.lastFailStage || "throw"})`);
    } finally {
      setBusy(false);
      tapLock.current = false;
    }
  }

  const osLabel =
    osPermission === "granted"
      ? t("chat_notifications_os_granted")
      : osPermission === "denied"
        ? t("chat_notifications_os_denied")
        : osPermission === "not_asked" || osPermission === "prompt"
          ? t("chat_notifications_os_prompt")
          : osPermission === "error"
            ? t("chat_notifications_error")
            : t("chat_notifications_os_unknown");
  const tokenActiveUi = Boolean(uid) && (tokenActive || regState?.status === "active");

  const appLabel = enabled
    ? t("chat_notifications_enabled")
    : t("chat_notifications_disabled");
  const actionLabel = busy
    ? t("chat_notifications_busy")
    : enabled
      ? t("chat_notifications_disable_cta")
      : t("chat_notifications_enable_cta");

  const toggleButton = (
    <button
      type="button"
      data-chat-notification-toggle={enabled ? "disable" : "enable"}
      disabled={busy}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void runToggle();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void runToggle();
      }}
      className={`pointer-events-auto min-h-12 min-w-[9.5rem] shrink-0 rounded-full px-5 py-3 text-sm font-black disabled:opacity-60 ${
        enabled
          ? "border border-white/15 bg-white/10 text-white"
          : "bg-[#6C63FF] text-white shadow-[0_0_24px_rgba(108,99,255,.35)]"
      }`}
    >
      {actionLabel}
    </button>
  );

  if (variant === "panel") {
    return (
      <div data-chat-notification-setting="panel" className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] px-4 py-4">
            <p
              data-chat-notification-app-status={enabled ? "on" : "off"}
              className="text-sm font-black text-white"
            >
              {t("chat_notifications_label")}: {appLabel}
            </p>
            <p
              data-chat-notification-os-status={osPermission}
              className="mt-2 text-xs font-semibold text-white/55"
            >
              {osLabel}
            </p>
            <p
              data-chat-notification-fcm-status={regState?.status || "unknown"}
              className="mt-2 text-xs font-semibold text-white/40"
            >
              {tokenActiveUi
                ? t("chat_notifications_token_on")
                : t("chat_notifications_token_off")}
            </p>
          </div>
          {error ? (
            <p data-chat-notification-error="1" className="text-sm font-semibold text-red-300">
              {error}
            </p>
          ) : null}
          {osPermission === "denied" ? (
            <button
              type="button"
              data-chat-notification-open-settings="1"
              onPointerUp={(event) => {
                event.preventDefault();
                void openNativeNotificationSettings();
              }}
              onClick={(event) => {
                event.preventDefault();
                void openNativeNotificationSettings();
              }}
              className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-black text-white"
            >
              {t("chat_notifications_open_settings")}
            </button>
          ) : null}
        </div>
        <div className="pointer-events-auto sticky bottom-0 mt-4 flex justify-end bg-zinc-950 pt-2">
          {toggleButton}
        </div>
      </div>
    );
  }

  if (variant === "classic") {
    return (
      <div className="border-b border-white/18 pb-8 mb-8">
        <p className="text-white/55 text-sm font-black uppercase tracking-wide mb-4">
          {t("chat_notifications_label")}
        </p>
        <p className="text-white/35">{t("chat_notifications_hint")}</p>
        <p className="mt-2 text-xs text-white/45">{osLabel}</p>
        {error ? <p className="mt-2 text-sm font-semibold text-red-300">{error}</p> : null}
        <div className="mt-5 flex items-center justify-end gap-3">{toggleButton}</div>
      </div>
    );
  }

  return (
    <div className="block">
      <span className="text-sm font-black text-white/70">{t("chat_notifications_label")}</span>
      <div className="mt-3 rounded-[1.25rem] border border-violet-400/35 bg-violet-500/10 px-4 py-4">
        <p className="text-sm text-zinc-300">{t("chat_notifications_hint")}</p>
        <p className="mt-2 text-xs text-white/55">{osLabel}</p>
        <p className="mt-1 text-xs text-white/45">{appLabel}</p>
        {error ? <p className="mt-2 text-sm font-semibold text-red-300">{error}</p> : null}
        <div className="mt-4 flex items-center justify-end">{toggleButton}</div>
      </div>
    </div>
  );
}
