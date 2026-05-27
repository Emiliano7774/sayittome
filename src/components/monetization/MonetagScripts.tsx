"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  shouldLoadMonetagInPagePush,
  shouldLoadMonetagVignette,
} from "@/lib/monetization/adSurfaces";
import {
  MONETAG_IN_PAGE_PUSH,
  MONETAG_VIGNETTE_BANNER,
} from "@/lib/monetization/monetagZones";

declare global {
  interface Window {
    sayittomeMonetagLoaded?: Record<string, boolean>;
  }
}

/**
 * Monetag / Monitag — In-Page Push + Vignette Banner.
 * Loaded lazily on allowed routes only (never login/chat/admin/register).
 */
export default function MonetagScripts() {
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(false);
  const [nativeVignetteReady, setNativeVignetteReady] = useState(
    () => typeof window !== "undefined" && !isNativeAppShell(),
  );

  useEffect(() => {
    if (!isNativeAppShell()) return;

    const timer = window.setTimeout(() => setNativeVignetteReady(true), 20_000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const sync = () => {
      setChatOpen(document.body.classList.contains("sayittome-chat-open"));
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const enabled = shouldLoadMonetagInPagePush(pathname) && !chatOpen;
  const vignetteEnabled =
    shouldLoadMonetagVignette(pathname) && !chatOpen && nativeVignetteReady;

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

  if (!enabled) {
    return null;
  }

  return (
    <>
      <Script
        id="monetag-inpage-push-zone"
        strategy="lazyOnload"
        dangerouslySetInnerHTML={{
          __html: `window.sayittomeMonetagLoaded=window.sayittomeMonetagLoaded||{};`,
        }}
      />
      <Script
        id="monetag-inpage-push"
        src={MONETAG_IN_PAGE_PUSH.src}
        strategy="lazyOnload"
        data-cfasync="false"
        data-zone={MONETAG_IN_PAGE_PUSH.zoneId}
        onLoad={() => {
          window.sayittomeMonetagLoaded = window.sayittomeMonetagLoaded || {};
          window.sayittomeMonetagLoaded.inPagePush = true;
        }}
      />
      {vignetteEnabled ? (
        <Script
          id="monetag-vignette-banner"
          src={MONETAG_VIGNETTE_BANNER.src}
          strategy="lazyOnload"
          data-cfasync="false"
          data-zone={MONETAG_VIGNETTE_BANNER.zoneId}
          onLoad={() => {
            window.sayittomeMonetagLoaded = window.sayittomeMonetagLoaded || {};
            window.sayittomeMonetagLoaded.vignette = true;
          }}
        />
      ) : null}
    </>
  );
}
