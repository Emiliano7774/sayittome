"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useMonetagShuffleInlineAd } from "@/hooks/useMonetagShuffleInlineAd";
import {
  isMonetagBodyBlocked,
  shouldLoadMonetagShuffleInline,
} from "@/lib/monetization/adSurfaces";
import { isMonetagWebEnabled } from "@/lib/monetization/monetagConfig";
import { logMonetag } from "@/lib/monetization/monetagDev";

type Props = {
  slotId: string;
  variant: "grid" | "list";
};

export default function MonetagShuffleSlot({ slotId, variant }: Props) {
  const pathname = usePathname();
  const [uiBlocked, setUiBlocked] = useState(false);

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

  const routeAllowed = shouldLoadMonetagShuffleInline(pathname);
  const enabled = isMonetagWebEnabled() && routeAllowed && !uiBlocked;
  const { ref, mounted } = useMonetagShuffleInlineAd(slotId, enabled);

  useEffect(() => {
    if (!enabled) return;
    logMonetag("shuffle-slot-ready", { slotId, pathname, mounted });
  }, [enabled, slotId, pathname, mounted]);

  if (!enabled) {
    return null;
  }

  const shellClass =
    variant === "grid"
      ? "col-span-2 rounded-2xl border border-white/10 bg-[#111] lg:col-span-3"
      : "w-full border-b border-white/10 bg-[#111]";

  return (
    <article
      data-monetag-ad-slot={slotId}
      data-stm-no-polish
      className={`${shellClass} px-4 py-4`}
      aria-label="Publicidad"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
        Publicidad
      </p>

      <div
        ref={ref}
        className={`mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-black/40 ${
          mounted ? "min-h-[120px]" : "min-h-[120px] animate-pulse"
        }`}
      />
    </article>
  );
}
