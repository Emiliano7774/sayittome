"use client";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import { useShuffleInlineNativeAd } from "@/hooks/useShuffleInlineNativeAd";

type Props = {
  slotId: string;
  variant: "grid" | "list";
};

export default function NativeAdShuffleSlot({ slotId, variant }: Props) {
  const enabled = isNativeAppShell();
  const { ref, ad, loading, handleOpenAd } = useShuffleInlineNativeAd(slotId, enabled);

  if (!enabled) {
    return null;
  }

  const shellClass =
    variant === "grid"
      ? "col-span-2 rounded-2xl border border-white/10 bg-[#111] lg:col-span-3"
      : "w-full border-b border-white/10 bg-[#111]";

  if (loading) {
    return (
      <div
        data-native-ad-slot={slotId}
        data-stm-no-polish
        className={`${shellClass} min-h-[120px] animate-pulse`}
        aria-hidden
      />
    );
  }

  if (!ad) {
    return null;
  }

  return (
    <article
      ref={ref}
      data-native-ad-slot={slotId}
      data-stm-no-polish
      className={`${shellClass} px-4 py-4`}
      aria-label="Publicidad"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
        Publicidad
      </p>

      <div className="mt-2 flex items-start gap-3">
        {ad.iconUrl ? (
          <img
            src={ad.iconUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl border border-white/10 object-cover"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          {ad.headline ? (
            <p className="text-base font-black leading-snug text-white">{ad.headline}</p>
          ) : null}
          {ad.body ? (
            <p className="mt-1 line-clamp-2 text-sm font-bold text-white/50">{ad.body}</p>
          ) : null}
          {ad.advertiser ? (
            <p className="mt-1 text-xs font-bold text-white/35">{ad.advertiser}</p>
          ) : null}
        </div>
      </div>

      {ad.cta ? (
        <button
          type="button"
          onClick={() => void handleOpenAd()}
          className="mt-3 rounded-full border border-violet-400/35 bg-violet-500/15 px-4 py-2 text-xs font-black text-violet-100"
        >
          {ad.cta}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleOpenAd()}
          className="mt-3 w-full min-h-[44px] rounded-xl border border-white/10 bg-black/40"
          aria-label="Abrir publicidad"
        />
      )}
    </article>
  );
}
