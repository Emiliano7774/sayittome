"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

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

/** Mark dest-layout + useful-paint for the active nav trace when primary content is ready. */
export function useNavUsefulPaint(ready: boolean) {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (!isNavTraceEnabled() || !ready) return;

    const stopObserving = observeDomMainVisible();
    navTraceMark("dest-layout");
    navTraceCommit();
    navTraceFinish(undefined, "useful-paint");

    return stopObserving;
  }, [ready, pathname]);
}

export function useNavDestLayout() {
  useLayoutEffect(() => {
    if (!isNavTraceEnabled()) return;
    navTraceMark("dest-layout");
    navTraceCommit();
  }, []);
}
