"use client";

import { Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { useT } from "@/contexts/LocaleContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  completeChatNotificationPrompt,
  getChatNotificationPrefs,
  getChatNotificationPrefsVersion,
  resetChatNotificationPromptOnLogout,
  setChatNotificationsEnabled,
  subscribeChatNotificationPrefs,
} from "@/lib/chat/chatNotificationPrefs";
import { requestChatNotificationPermission } from "@/lib/chat/chatNotifications";
import { enableNativeChatPush, enableWebChatPush } from "@/lib/chat/fcmPush";
import { enableStoryNotificationPack } from "@/lib/stories/storyNotificationPrefs";
import { isNotificationProfileReady } from "@/lib/chat/notificationProfileReady";
import { chatNotificationPromptOpen } from "@/lib/chat/chatNotificationPromptOpen";
import { isCapacitorNative } from "@/lib/app/nativeShell";
import {
  ANON_MATCH_DOOR_EVENT,
  isAnonMatchDoorOpen,
} from "@/lib/anonMatch/anonMatchDoor";
import { isChatThreadRoute, isProfileChatRoute } from "@/lib/navigation/routeKind";

export { chatNotificationPromptOpen } from "@/lib/chat/chatNotificationPromptOpen";

function subscribeAnonMatchDoor(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(ANON_MATCH_DOOR_EVENT, onStoreChange);
  return () => window.removeEventListener(ANON_MATCH_DOOR_EVENT, onStoreChange);
}

function getAnonMatchDoorVersion(uid?: string, isAnonymous?: boolean) {
  return `${uid || ""}:${isAnonymous ? 1 : 0}:${isAnonMatchDoorOpen() ? 1 : 0}`;
}

export default function ChatNotificationPrompt() {
  const t = useT();
  const pathname = usePathname() || "/";
  const { firebaseUser, profile, loading } = useAuth();
  const prefsVersion = useSyncExternalStore(
    subscribeChatNotificationPrefs,
    getChatNotificationPrefsVersion,
    () => "0-0",
  );
  void prefsVersion;
  const doorVersion = useSyncExternalStore(
    subscribeAnonMatchDoor,
    () => getAnonMatchDoorVersion(firebaseUser?.uid, firebaseUser?.isAnonymous),
    () => "0:0:0",
  );
  void doorVersion;
  const prefs = getChatNotificationPrefs();
  const anonDoorOpen = Boolean(
    firebaseUser &&
      (!firebaseUser.isAnonymous || isAnonMatchDoorOpen(firebaseUser)),
  );
  const anonChatOpen = Boolean(
    firebaseUser?.isAnonymous &&
      (isProfileChatRoute(pathname) || isChatThreadRoute(pathname)),
  );
  const profileReady = Boolean(
    firebaseUser &&
      isNotificationProfileReady({
        loading,
        isAnonymous: firebaseUser.isAnonymous,
        uid: firebaseUser.uid,
        username: profile?.username,
        profileSetupComplete: profile?.profileSetupComplete,
        email: profile?.email || firebaseUser.email || "",
        emailVerified: firebaseUser.emailVerified,
        anonDoorOpen,
        anonChatOpen,
      }),
  );
  const notificationApiReady =
    isCapacitorNative() || (typeof Notification !== "undefined");
  const open = chatNotificationPromptOpen({
    loading,
    hasUser: Boolean(firebaseUser),
    profileReady,
    notificationApiReady,
    prompted: prefs.prompted,
  });

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      resetChatNotificationPromptOnLogout();
    }
  }, [firebaseUser, loading]);

  async function choose(enabled: boolean) {
    if (!enabled) {
      completeChatNotificationPrompt(false);
      return;
    }

    setChatNotificationsEnabled(true);
    void enableStoryNotificationPack();
    const granted = await requestChatNotificationPermission({ force: true });
    if (!granted) {
      setChatNotificationsEnabled(false);
      completeChatNotificationPrompt(false);
      return;
    }

    if (isCapacitorNative()) {
      const result = await enableNativeChatPush(firebaseUser);
      if (!result.ok && result.reason !== "not_native") {
        setChatNotificationsEnabled(false);
        if (result.reason === "denied") completeChatNotificationPrompt(false);
        return;
      }
    } else {
      const result = await enableWebChatPush(firebaseUser);
      if (!result.ok && result.reason !== "not_web") {
        setChatNotificationsEnabled(false);
        return;
      }
    }

    completeChatNotificationPrompt(true);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/85 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-notification-prompt-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-violet-500/35 bg-[#07070B] p-6 shadow-[0_16px_34px_rgba(108,99,255,0.22)]">
        <div className="flex items-start gap-3">
          <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5D5FEF] to-[#8C84FF]">
            <Bell size={21} className="text-white" />
          </div>
          <div>
            <h2 id="chat-notification-prompt-title" className="text-[22px] font-black text-white">
              {t("chat_notifications_prompt_title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              {t("chat_notifications_prompt_body")}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => void choose(true)}
            className="w-full rounded-[18px] bg-[#6C63FF] py-3.5 text-sm font-black text-white"
          >
            {t("chat_notifications_prompt_yes")}
          </button>
          <button
            type="button"
            onClick={() => void choose(false)}
            className="w-full rounded-[18px] border border-white/15 bg-white/5 py-3.5 text-sm font-black text-white"
          >
            {t("chat_notifications_prompt_no")}
          </button>
        </div>
      </div>
    </div>
  );
}
