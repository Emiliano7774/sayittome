"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import {
  getMainTabKeepAliveVersion,
  resolveEffectiveMainTab,
  subscribeMainTabKeepAlive,
} from "@/lib/navigation/mainTabKeepAlive";
import {
  isNavTraceEnabled,
  navTraceCommit,
  navTraceFinish,
  navTraceMark,
  navTraceMarkDetail,
} from "@/lib/perf/navTrace";

function markDomMainVisible() {
  navTraceMarkDetail("dom-main-visible");
}

function observeDomMainVisible() {
  if (!isNavTraceEnabled() || typeof document === "undefined") return () => {};

  const selector = "[data-nav-primary-content]";
  if (document.querySelector(selector)) {
    markDomMainVisible();
    return () => {};
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector(selector)) {
      markDomMainVisible();
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * Mark dest-layout + useful-paint when primary content is ready.
 * Pass `routeHref` on keep-alive surfaces so hidden panels do not finish another tab's trace.
 */
export function useNavUsefulPaint(ready: boolean, routeHref?: string) {
  const pathname = usePathname();
  useSyncExternalStore(
    subscribeMainTabKeepAlive,
    getMainTabKeepAliveVersion,
    getMainTabKeepAliveVersion,
  );
  const effectivePath = resolveEffectiveMainTab(pathname);
  const isActiveSurface = routeHref ? effectivePath === routeHref : true;

  useLayoutEffect(() => {
    if (!isNavTraceEnabled() || !ready || !isActiveSurface) return;

    const stopObserving = observeDomMainVisible();
    navTraceMark("dest-layout");
    navTraceCommit();
    navTraceFinish(undefined, "useful-paint");

    return stopObserving;
  }, [ready, effectivePath, isActiveSurface]);
}

export function useNavDestLayout() {
  useLayoutEffect(() => {
    if (!isNavTraceEnabled()) return;
    navTraceMark("dest-layout");
    navTraceCommit();
  }, []);
}
