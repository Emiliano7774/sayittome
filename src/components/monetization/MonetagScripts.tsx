"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { shouldLoadWebAds } from "@/lib/monetization/adSurfaces";
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

  const enabled = shouldLoadWebAds(pathname) && !chatOpen;

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
    </>
  );
}
