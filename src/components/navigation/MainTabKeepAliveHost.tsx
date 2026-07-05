"use client";

import type { ComponentType } from "react";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";

import { BoostRouteContent } from "@/app/boost/page";
import { ChatsRouteContent } from "@/app/chats/page";
import { SettingsRouteContent } from "@/app/settings/page";
import { StoriesRouteContent } from "@/app/stories/page";
import { useEffectivePathname } from "@/contexts/MainTabShellContext";
import {
  getMainTabKeepAliveVersion,
  isMainTabPanelVisible,
  listMainTabKeepAliveHrefs,
  pinMainTabKeepAlive,
  shouldRenderMainTabKeepAliveHost,
  subscribeMainTabKeepAlive,
} from "@/lib/navigation/mainTabKeepAlive";
import type { MainTabHref } from "@/lib/navigation/mainTabs";

const PANELS: Record<Exclude<MainTabHref, "/shuffle">, ComponentType> = {
  "/stories": StoriesRouteContent,
  "/chats": ChatsRouteContent,
  "/boost": BoostRouteContent,
  "/settings": SettingsRouteContent,
};

export default function MainTabKeepAliveHost() {
  const pathname = usePathname();
  const effectivePathname = useEffectivePathname();

  useSyncExternalStore(
    subscribeMainTabKeepAlive,
    getMainTabKeepAliveVersion,
    getMainTabKeepAliveVersion,
  );

  useLayoutEffect(() => {
    if (shouldRenderMainTabKeepAliveHost(pathname)) {
      pinMainTabKeepAlive();
    }
  }, [pathname]);

  if (!shouldRenderMainTabKeepAliveHost(pathname)) {
    return null;
  }

  return (
    <>
      {listMainTabKeepAliveHrefs()
        .filter((href): href is Exclude<MainTabHref, "/shuffle"> => href !== "/shuffle")
        .map((href) => {
          const Panel = PANELS[href];
          const visible = isMainTabPanelVisible(effectivePathname, href);

          return (
            <div
              key={href}
              id={`sayittome-main-tab-keepalive-${href.slice(1)}`}
              className={
                visible
                  ? "sayittome-main-tab-keepalive-visible"
                  : "sayittome-main-tab-keepalive-frozen"
              }
              aria-hidden={!visible}
            >
              <Panel />
            </div>
          );
        })}
    </>
  );
}

export function isMainTabRouteHandledByKeepAlive(pathname: string, href: MainTabHref) {
  return (
    shouldRenderMainTabKeepAliveHost(pathname) &&
    isMainTabPanelVisible(pathname, href)
  );
}
