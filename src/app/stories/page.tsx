"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import { useUxMode } from "@/contexts/UxModeContext";
import ModernStoriesPage from "@/components/modern/ModernStoriesPage";
import {
  getMainTabKeepAliveVersion,
  isMainTabRouteHandledByKeepAlive,
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

  // Suppress when keep-alive owns this tab OR another concrete main tab
  // (stale Next page slot after soft history pushState).
  if (isMainTabRouteHandledByKeepAlive(pathname, "/stories")) {
    return null;
  }

  return <StoriesRouteContent />;
}
