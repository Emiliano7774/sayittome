"use client";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import { useMonetagShuffleInlineAd } from "@/hooks/useMonetagShuffleInlineAd";

type Props = {
  slotId: string;
  variant: "grid" | "list";
};

export default function MonetagShuffleSlot({ slotId, variant }: Props) {
  const enabled = !isNativeAppShell();
  const { ref, mounted } = useMonetagShuffleInlineAd(slotId, enabled);

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
