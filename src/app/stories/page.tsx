"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import { useUxMode } from "@/contexts/UxModeContext";
import ModernStoriesPage from "@/components/modern/ModernStoriesPage";
import { isMainTabRouteHandledByKeepAlive } from "@/components/navigation/MainTabKeepAliveHost";
import {
  getMainTabKeepAliveVersion,
  subscribeMainTabKeepAlive,
} from "@/lib/navigation/mainTabKeepAlive";

import ClassicStoriesPage from "./classic-stories-page";

export function StoriesRouteContent() {
  const { uxMode } = useUxMode();

  if (uxMode === "modern") {
    return <ModernStoriesPage />;
  }

  return <ClassicStoriesPage />;
}

export default function StoriesPage() {
  const pathname = usePathname();

  useSyncExternalStore(
    subscribeMainTabKeepAlive,
    getMainTabKeepAliveVersion,
    getMainTabKeepAliveVersion,
  );

  if (isMainTabRouteHandledByKeepAlive(pathname, "/stories")) {
    return null;
  }

  return <StoriesRouteContent />;
}
