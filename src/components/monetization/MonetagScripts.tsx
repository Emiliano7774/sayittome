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
import {
  MONETAG_PUSH_ZONE,
  MONETAG_VIGNETTE_ZONES,
  officialVignetteIife,
  type MonetagVignetteZoneId,
} from "@/lib/monetization/monetagZones";
import {
  attachVignetteExposureAuditExports,
  tryRecordMonetagZoneExposure,
  tryRecordVignetteExposure,
} from "@/lib/monetization/vignetteExposureAudit";

declare global {
  interface Window {
    sayittomeMonetagLoaded?: {
      loadedVignetteZones?: Partial<Record<MonetagVignetteZoneId, boolean>>;
      loadedPushZones?: Partial<Record<string, boolean>>;
      /** @deprecated Use loadedVignetteZones["11011520"] */
      vignette?: boolean;
    };
    exportVignetteExposureAudit?: () => unknown[];
    exportVignetteOpportunityAudit?: () => unknown[];
    exportMonetagExposureAudit?: () => unknown[];
  }
}

function markVignetteZoneLoaded(zoneId: MonetagVignetteZoneId) {
  window.sayittomeMonetagLoaded = window.sayittomeMonetagLoaded || {};
  window.sayittomeMonetagLoaded.loadedVignetteZones =
    window.sayittomeMonetagLoaded.loadedVignetteZones || {};
  window.sayittomeMonetagLoaded.loadedVignetteZones[zoneId] = true;
  if (zoneId === "11011520") {
    window.sayittomeMonetagLoaded.vignette = true;
  }
}

function markPushZoneLoaded(zoneId: string) {
  window.sayittomeMonetagLoaded = window.sayittomeMonetagLoaded || {};
  window.sayittomeMonetagLoaded.loadedPushZones =
    window.sayittomeMonetagLoaded.loadedPushZones || {};
  window.sayittomeMonetagLoaded.loadedPushZones[zoneId] = true;
}

/**
 * Monetag web zones (Vignette 11011520/11255233/11255234 + Push 11255229).
 * Official script lifecycle only — Monetag controls real delivery frequency.
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
  const pushEnabled = !isNativeAppShell();

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
      pushEnabled,
    });
  }, [pathname, uiBlocked, vignetteEnabled, surfaceEligible, pushEnabled]);

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

  const buildExposureInput = () => ({
    pathname,
    documentHidden: typeof document !== "undefined" ? document.hidden : false,
    overlayBlocked: uiBlocked,
    nativeVignetteReady,
  });

  return (
    <>
      <Script
        id="monetag-loaded-init"
        strategy="lazyOnload"
        dangerouslySetInnerHTML={{
          __html:
            "window.sayittomeMonetagLoaded=window.sayittomeMonetagLoaded||{};window.sayittomeMonetagLoaded.loadedVignetteZones=window.sayittomeMonetagLoaded.loadedVignetteZones||{};window.sayittomeMonetagLoaded.loadedPushZones=window.sayittomeMonetagLoaded.loadedPushZones||{};",
        }}
      />

      {vignetteEnabled &&
        MONETAG_VIGNETTE_ZONES.map((zone) => {
          if (zone.integration === "next-script") {
            return (
              <Script
                key={zone.zoneId}
                id={zone.scriptId}
                src={zone.src}
                strategy="lazyOnload"
                data-cfasync="false"
                data-zone={zone.zoneId}
                onLoad={() => {
                  markVignetteZoneLoaded(zone.zoneId);
                  logMonetag("vignette-loaded", { zone: zone.zoneId });
                  tryRecordMonetagZoneExposure(zone.zoneId, {
                    ...buildExposureInput(),
                    trigger: "script-on-load",
                  });
                }}
              />
            );
          }

          return (
            <Script
              key={zone.zoneId}
              id={zone.scriptId}
              strategy="lazyOnload"
              dangerouslySetInnerHTML={{
                __html: officialVignetteIife(zone.zoneId),
              }}
              onLoad={() => {
                markVignetteZoneLoaded(zone.zoneId);
                logMonetag("vignette-iife-installed", { zone: zone.zoneId });
                tryRecordMonetagZoneExposure(zone.zoneId, {
                  ...buildExposureInput(),
                  trigger: "script-on-load",
                });
              }}
            />
          );
        })}

      {pushEnabled ? (
        <Script
          id={MONETAG_PUSH_ZONE.scriptId}
          src={MONETAG_PUSH_ZONE.src}
          strategy="lazyOnload"
          data-cfasync="false"
          async
          onLoad={() => {
            markPushZoneLoaded(MONETAG_PUSH_ZONE.zoneId);
            logMonetag("push-loaded", { zone: MONETAG_PUSH_ZONE.zoneId });
            tryRecordMonetagZoneExposure(MONETAG_PUSH_ZONE.zoneId, {
              ...buildExposureInput(),
              trigger: "script-on-load",
            });
          }}
        />
      ) : null}
    </>
  );
}
