"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { attachNavTraceWindow, isNavTraceEnabled, navTraceMarkDetail } from "@/lib/perf/navTrace";
import { attachChatsPipelineWindow } from "@/lib/perf/chatsPipelineTrace";
import { attachProfilePipelineWindow } from "@/lib/perf/profilePipelineTrace";
import { attachSettingsPipelineWindow } from "@/lib/perf/settingsPipelineTrace";
import { attachStoryPipelineWindow } from "@/lib/perf/storyPipelineTrace";
import { clearInboxMemoryCacheOnly, clearInboxSnapshotCache } from "@/lib/chat/inboxSnapshot";
import { clearCachedFullProfile } from "@/lib/profile/profileCache";
import { clearChatsInboxHydrationSession } from "@/hooks/useChatsInboxReady";
import { getCachedStoryGroups, prefetchOwnerStories, refreshStoriesIndex } from "@/lib/stories/storiesIndexStore";
import { clearStoryPreloadCache, preloadStoryMedia } from "@/lib/stories/preload";
import {
  notifyNativePathnameChanged,
  readNativePathname,
  resolveNativeBackNavigation,
} from "@/lib/navigation/handleNativeBack";
import { isInstantShuffleReturnDestination, prepareInstantShuffleReturn } from "@/lib/navigation/shuffleKeepAlive";
import { MAIN_TAB_HREFS } from "@/lib/navigation/mainTabs";
import { chatsPipelineMark } from "@/lib/perf/chatsPipelineTrace";
import { settingsPipelineMark } from "@/lib/perf/settingsPipelineTrace";

const HARDWARE_BACK_EVENT = "sayittomeHardwareBack";

function NavTracePathWatcher() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (!isNavTraceEnabled()) return;
    notifyNativePathnameChanged(pathname);
    navTraceMarkDetail("pathname-changed");

    const path = pathname.split("?")[0].split("#")[0];
    if (!(MAIN_TAB_HREFS as readonly string[]).includes(path) || path === "/shuffle") return;

    navTraceMarkDetail("tab-pin");
    navTraceMarkDetail("tab-panel-visible");
    navTraceMarkDetail(`tab-active-${path.slice(1)}`);
    if (path === "/chats") chatsPipelineMark("chats-panel-visible");
    if (path === "/settings") settingsPipelineMark("settings-panel-visible");
  }, [pathname]);

  return null;
}

function NavTraceWebBackProbe() {
  const router = useRouter();
  const pathnameRef = useRef("");

  useEffect(() => {
    if (!isNavTraceEnabled()) return;

    const onHardwareBack = () => {
      const currentPath = readNativePathname();
      pathnameRef.current = currentPath;
      const action = resolveNativeBackNavigation(currentPath);
      if (!action) return;

      if (action.navigateTo) {
        pathnameRef.current = action.navigateTo;
        if (isInstantShuffleReturnDestination(action.navigateTo)) {
          prepareInstantShuffleReturn();
          router.replace(action.navigateTo);
          return;
        }
        router.replace(action.navigateTo);
      }
    };

    window.addEventListener(HARDWARE_BACK_EVENT, onHardwareBack);
    return () => window.removeEventListener(HARDWARE_BACK_EVENT, onHardwareBack);
  }, [router]);

  return null;
}

/** Dev/bench-only bootstrap. Inert unless nav trace is enabled via env or localStorage. */
export default function NavTraceBootstrap() {
  useEffect(() => {
    attachNavTraceWindow();
    attachProfilePipelineWindow();
    attachChatsPipelineWindow();
    attachSettingsPipelineWindow();
    attachStoryPipelineWindow();

    if (!isNavTraceEnabled() || typeof window === "undefined") return;

    window.__sayittomeStoriesBench = {
      getGroups: () => getCachedStoryGroups(),
      clearPreload: () => clearStoryPreloadCache(),
      preloadOwner: (ownerUid: string) => prefetchOwnerStories(ownerUid),
      refreshIndex: () => refreshStoriesIndex(undefined, true),
      preloadMediaUrl: (mediaUrl: string, storyId = "bench") => {
        preloadStoryMedia({
          id: storyId,
          ownerUid: "",
          mediaUrl,
          mediaType: "image",
          createdAtMs: Date.now(),
          expiresAtMs: Date.now() + 86_400_000,
          likeCount: 0,
          viewCount: 0,
        });
      },
    };

    window.__sayittomeProfileCache = {
      clear: (username?: string) => clearCachedFullProfile(username),
    };
    window.__sayittomeInboxCache = {
      clear: () => {
        clearInboxSnapshotCache();
        clearChatsInboxHydrationSession();
      },
      clearMemory: () => {
        clearInboxMemoryCacheOnly();
      },
    };
    window.__sayittomeSettingsCache = {
      clear: () => {
        window.sessionStorage.removeItem("sayittome:settings-self-profile:v1");
        clearCachedFullProfile();
      },
      clearSession: () => {
        window.sessionStorage.removeItem("sayittome:settings-self-profile:v1");
      },
      clearMemory: () => {
        clearCachedFullProfile();
      },
    };
  }, []);

  if (!isNavTraceEnabled()) return null;

  return (
    <>
      <NavTracePathWatcher />
      <NavTraceWebBackProbe />
    </>
  );
}

declare global {
  interface Window {
    __sayittomeProfileCache?: {
      clear: (username?: string) => void;
    };
    __sayittomeSettingsCache?: {
      clear: () => void;
      clearSession: () => void;
      clearMemory: () => void;
    };
  }
}
