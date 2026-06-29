"use client";

import { EyeOff } from "lucide-react";

import { useAdminSession } from "@/hooks/useAdminSession";
import { isShuffleProfileModerated } from "@/lib/shuffle/resolveShuffleBlur";
import type { ShuffleProfile } from "@/lib/shuffle/types";

type Props = {
  profile: ShuffleProfile;
  variant?: "classic" | "modern";
};

export default function ShuffleModeratedIndicator({
  profile,
  variant = "classic",
}: Props) {
  const { ready, isAdmin } = useAdminSession();

  if (!isShuffleProfileModerated(profile)) return null;

  const modern = variant === "modern";

  return (
    <>
      <span
        aria-hidden
        className={[
          "pointer-events-none absolute inset-0 z-[1]",
          modern ? "rounded-[2.5rem] bg-black/25" : "",
        ].join(" ")}
      />
      {ready && isAdmin ? (
        <span
          className={[
            "pointer-events-none absolute z-[2] inline-flex items-center justify-center rounded-full border backdrop-blur-sm",
            modern
              ? "left-3 top-3 h-7 w-7 border-white/20 bg-black/55 text-white/70"
              : "bottom-1 left-1 h-6 w-6 border-violet-400/30 bg-black/60 text-violet-200/90",
          ].join(" ")}
          title="Perfil moderado"
          aria-label="Perfil moderado"
        >
          <EyeOff size={modern ? 13 : 12} strokeWidth={2.2} />
        </span>
      ) : null}
    </>
  );
}
