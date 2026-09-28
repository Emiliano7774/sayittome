"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import ClassicBoostPage from "@/components/boost/ClassicBoostPage";
import ModernBoostPage from "@/components/boost/ModernBoostPage";
import { useUxMode } from "@/contexts/UxModeContext";
import {
  getMainTabKeepAliveVersion,
  isMainTabRouteHandledByKeepAlive,
  subscribeMainTabKeepAlive,
} from "@/lib/navigation/mainTabKeepAlive";

export function BoostRouteContent() {
  const { uxMode } = useUxMode();

  if (uxMode === "modern") {
    return <ModernBoostPage />;
  }

  return <ClassicBoostPage />;
}

export default function BoostPage() {
  const pathname = usePathname();

  useSyncExternalStore(
    subscribeMainTabKeepAlive,
    getMainTabKeepAliveVersion,
    getMainTabKeepAliveVersion,
  );

  if (isMainTabRouteHandledByKeepAlive(pathname, "/boost")) {
    return null;
  }

  return <BoostRouteContent />;
}
