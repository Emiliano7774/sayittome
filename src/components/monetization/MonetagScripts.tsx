"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  isMonetagBodyBlocked,
  shouldLoadMonetagVignette,
} from "@/lib/monetization/adSurfaces";
import { isMonetagWebEnabled } from "@/lib/monetization/monetagConfig";
import { logMonetag } from "@/lib/monetization/monetagDev";
import { MONETAG_VIGNETTE_BANNER } from "@/lib/monetization/monetagZones";

declare global {
  interface Window {
    sayittomeMonetagLoaded?: Record<string, boolean>;
  }
}

/**
 * Monetag — Vignette Banner (web only).
 * Never loads on login/register/admin/chat or sensitive overlays.
 */
export default function MonetagScripts() {
  const pathname = usePathname();
  const [uiBlocked, setUiBlocked] = useState(false);
  const [nativeVignetteReady, setNativeVignetteReady] = useState(
    () => typeof window !== "undefined" && !isNativeAppShell(),
  );

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

  const vignetteEnabled =
    shouldLoadMonetagVignette(pathname) && !uiBlocked && nativeVignetteReady;

  useEffect(() => {
    logMonetag(vignetteEnabled ? "vignette-enabled" : "vignette-blocked", {
      pathname,
      uiBlocked,
      vignetteEnabled,
    });
  }, [pathname, uiBlocked, vignetteEnabled]);

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
        }}
      />
    </>
  );
}
