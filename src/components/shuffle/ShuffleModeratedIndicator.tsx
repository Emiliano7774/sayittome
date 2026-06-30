"use client";

import { EyeOff } from "lucide-react";

import { useAdminSession } from "@/hooks/useAdminSession";
import { isShuffleProfileModerated } from "@/lib/shuffle/resolveShuffleBlur";
import type { ShuffleProfile } from "@/lib/shuffle/types";

type Props = {
  profile: ShuffleProfile;
  variant?: "classic" | "modern";
  /** Render centered inside the circular avatar (classic shuffle row). */
  placement?: "avatar" | "card";
  iconSize?: number;
};

export default function ShuffleModeratedIndicator({
  profile,
  variant = "classic",
  placement = "card",
  iconSize = 14,
}: Props) {
  const { ready, isAdmin } = useAdminSession();

  if (!isShuffleProfileModerated(profile)) return null;

  const modern = variant === "modern";
  const badgeSize = Math.max(20, Math.min(36, Math.round(iconSize * 1.15)));
  const eyeSize = Math.max(11, Math.min(16, Math.round(iconSize * 0.72)));

  const badge = ready && isAdmin ? (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full border backdrop-blur-sm",
        modern
          ? "border-white/20 bg-black/70 text-white/75"
          : "border-violet-400/35 bg-black/75 text-violet-100/90",
      ].join(" ")}
      style={{ width: badgeSize, height: badgeSize }}
      title="Perfil moderado"
      aria-label="Perfil moderado"
    >
      <EyeOff size={eyeSize} strokeWidth={2.2} />
    </span>
  ) : null;

  const overlay = (
    <>
      <span
        aria-hidden
        className={[
          "pointer-events-none absolute inset-0",
          modern ? "rounded-[2.5rem] bg-black/30" : "rounded-full bg-black/40",
        ].join(" ")}
      />
      {badge ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {badge}
        </span>
      ) : null}
    </>
  );

  if (placement === "avatar") {
    return <div className="pointer-events-none absolute inset-0 z-10">{overlay}</div>;
  }

  return overlay;
}
