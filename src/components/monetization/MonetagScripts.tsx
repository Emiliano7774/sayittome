"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  isMonetagBodyBlocked,
  isVignetteSurfaceEligible,
} from "@/lib/monetization/adSurfaces";
import { isMonetagWebEnabled } from "@/lib/monetization/monetagConfig";
import { logMonetag } from "@/lib/monetization/monetagDev";
import { MONETAG_VIGNETTE_BANNER } from "@/lib/monetization/monetagZones";
import {
  attachVignetteExposureAuditExports,
  tryRecordVignetteExposure,
} from "@/lib/monetization/vignetteExposureAudit";

declare global {
  interface Window {
    sayittomeMonetagLoaded?: Record<string, boolean>;
    exportVignetteExposureAudit?: () => unknown[];
    exportVignetteOpportunityAudit?: () => unknown[];
  }
}

/**
 * Monetag Vignette Banner (zone 11011520, web only).
 * Official script lifecycle only — Monetag controls real ad frequency.
 */
export default function MonetagScripts() {
  const pathname = usePathname();
  const [uiBlocked, setUiBlocked] = useState(false);
  const [nativeVignetteReady, setNativeVignetteReady] = useState(
    () => typeof window !== "undefined" && !isNativeAppShell(),
  );
  const lastPathnameRef = useRef<string | null>(null);
  const initialRecordedRef = useRef(false);

  useEffect(() => {
    attachVignetteExposureAuditExports();
  }, []);

  useEffect(() => {
    if (!isNativeAppShell()) return;

    const timer = window.setTimeout(() => setNativeVignetteReady(true), 20_000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const sync = () => setUiBlocked(isMonetagBodyBlocked());

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  if (!isMonetagWebEnabled()) {
    return null;
  }

  const surfaceEligible = isVignetteSurfaceEligible(pathname);
  const vignetteEnabled =
    surfaceEligible && !uiBlocked && nativeVignetteReady;

  useEffect(() => {
    if (!isMonetagWebEnabled()) return;

    const record = (trigger: "initial-surface" | "pathname-commit" | "overlay-change") => {
      tryRecordVignetteExposure({
        pathname,
        trigger,
        documentHidden: document.hidden,
        overlayBlocked: uiBlocked,
        nativeVignetteReady,
      });
    };

    if (!initialRecordedRef.current) {
      initialRecordedRef.current = true;
      record("initial-surface");
      lastPathnameRef.current = pathname;
      return;
    }

    if (lastPathnameRef.current !== pathname) {
      lastPathnameRef.current = pathname;
      record("pathname-commit");
      return;
    }

    record("overlay-change");
  }, [pathname, uiBlocked, nativeVignetteReady]);

  useEffect(() => {
    if (!isMonetagWebEnabled()) return;

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      tryRecordVignetteExposure({
        pathname,
        trigger: "visibility-restored",
        documentHidden: false,
        overlayBlocked: uiBlocked,
        nativeVignetteReady,
      });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [pathname, uiBlocked, nativeVignetteReady]);

  useEffect(() => {
    logMonetag(vignetteEnabled ? "vignette-enabled" : "vignette-blocked", {
      pathname,
      uiBlocked,
      vignetteEnabled,
      surfaceEligible,
    });
  }, [pathname, uiBlocked, vignetteEnabled, surfaceEligible]);

  useEffect(() => {
    if (!vignetteEnabled) {
      document.body.classList.remove("sayittome-vignette-active");
      return;
    }

    document.body.classList.add("sayittome-vignette-active");

    return () => {
      document.body.classList.remove("sayittome-vignette-active");
    };
  }, [vignetteEnabled]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const report = () => {
      const scripts = document.querySelectorAll('script[src*="n6wxm"]').length;
      logMonetag("dev-check", {
        pathname,
        scriptCount: scripts,
        loaded: window.sayittomeMonetagLoaded ?? null,
        slots: document.querySelectorAll("[data-monetag-ad-slot]").length,
      });
    };

    const timer = window.setTimeout(report, 2500);
    return () => window.clearTimeout(timer);
  }, [pathname, vignetteEnabled]);

  if (!vignetteEnabled) {
    return null;
  }

  return (
    <>
      <Script
        id="monetag-vignette-init"
        strategy="lazyOnload"
        dangerouslySetInnerHTML={{
          __html: `window.sayittomeMonetagLoaded=window.sayittomeMonetagLoaded||{};`,
        }}
      />
      <Script
        id="monetag-vignette-banner"
        src={MONETAG_VIGNETTE_BANNER.src}
        strategy="lazyOnload"
        data-cfasync="false"
        data-zone={MONETAG_VIGNETTE_BANNER.zoneId}
        onLoad={() => {
          window.sayittomeMonetagLoaded = window.sayittomeMonetagLoaded || {};
          window.sayittomeMonetagLoaded.vignette = true;
          logMonetag("vignette-loaded", { zone: MONETAG_VIGNETTE_BANNER.zoneId });
          tryRecordVignetteExposure({
            pathname,
            trigger: "script-on-load",
            documentHidden: document.hidden,
            overlayBlocked: uiBlocked,
            nativeVignetteReady,
          });
        }}
      />
    </>
  );
}
